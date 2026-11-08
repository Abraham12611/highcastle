import {
  CreateScanRequestSchema,
  CreateScanResponseSchema,
  ScanEventsQuerySchema,
  ScanEventSchema,
  TEST_PACK_MANIFEST,
  toScanSummary,
  type AuthorizationScope,
  type Scan,
  type TestPackId,
} from "@highcastle/contracts";
import {
  appendScanEvent,
  createScan,
  getScan,
  getScope,
  listAttempts,
  listContainmentForScan,
  listScanEvents,
  listScans,
  requestScanCancel,
} from "@highcastle/db";
import { DEMO_IDS, DbError } from "@highcastle/db";
import {
  checkPackAuthorization,
  checkScopeRelations,
  checkScopeStatus,
} from "@highcastle/security";
import { scanAdmissionFor } from "./admission";
import type { BffDeps } from "./deps";
import { requestTime } from "./deps";
import {
  assertExecutionBinding,
  authorizeProject,
  authorizeWorkspaceMutation,
  loadExecutionScope,
} from "./authz";
import {
  mapEnvironment,
  mapProject,
  mapScanEvent,
  mapScope,
  mapTarget,
} from "./mappers";
import { JOB_ENQUEUE_DEDUPE_SECONDS, QueueUnavailable } from "./queue";

/**
 * Scan lifecycle flows. The API persists real rows and enqueues real worker
 * jobs — it never executes tests inline, never invents results, and never
 * accepts client-chosen hosts, scopes, or verdicts.
 */

export interface RouteResult {
  status: number;
  body: unknown;
}

function oracleVersionFor(packIds: readonly string[]): string {
  const first = packIds[0] as TestPackId | undefined;
  if (!first || !(first in TEST_PACK_MANIFEST)) return "unknown";
  return TEST_PACK_MANIFEST[first].oracleVersion;
}

interface Denial {
  code: string;
  message: string;
}

function toDenial(reason: { code: string; detail: string }): Denial {
  return { code: reason.code, message: reason.detail };
}

function denyToError(reasons: Denial[]): DbError | null {
  if (reasons.length === 0) return null;
  const quote = reasons.map((reason) => reason.message).join("; ");
  const unknownPack = reasons.some((reason) => reason.code === "pack_unknown");
  return new DbError(
    unknownPack ? "unprocessable" : "policy_denied",
    `request denied by execution policy: ${quote}`,
  );
}

async function gateExecution(
  deps: BffDeps,
  args: {
    workspaceId: string;
    projectId: string;
    targetId: string;
    environmentId: string;
    scopeId: string;
    packIds: TestPackId[];
    maxDurationSeconds?: number;
  },
): Promise<{ scopeHash: string; targetRevision: string; fixtureVersion: string }> {
  const now = requestTime(deps);
  const loaded = await loadExecutionScope(
    deps.db,
    args.workspaceId,
    args.projectId,
    args.targetId,
    args.environmentId,
    args.scopeId,
  );
  const projectRow = await authorizeProject(
    deps.db,
    deps.session,
    args.workspaceId,
    args.projectId,
  );
  const scope = mapScope(loaded.scope);
  const target = mapTarget(loaded.target);
  const environment = mapEnvironment(loaded.environment);
  const project = mapProject(projectRow);
  const reasons: Denial[] = [
    ...checkScopeStatus(scope, now).map(toDenial),
    ...checkScopeRelations(scope, { project, target, environment }, now).map(
      toDenial,
    ),
  ];
  for (const packId of args.packIds) {
    reasons.push(...checkPackAuthorization(scope, packId).map(toDenial));
  }
  if (
    args.maxDurationSeconds !== undefined &&
    args.maxDurationSeconds > scope.maxDurationSeconds
  ) {
    reasons.push({
      code: "budget_exceeded",
      message: `maxDurationSeconds ${args.maxDurationSeconds} exceeds scope budget ${scope.maxDurationSeconds}`,
    });
  }
  const denied = denyToError(reasons);
  if (denied) throw denied;
  return {
    scopeHash: scope.scopeHash,
    targetRevision: environment.currentRevision,
    fixtureVersion: environment.fixtureVersion,
  };
}

function mapScanRow(row: {
  id: string;
  workspaceId: string;
  projectId: string;
  scopeId: string;
  sourceSnapshotRef: string | null;
  targetId: string;
  environmentId: string | null;
  targetRevision: string;
  fixtureVersion: string | null;
  scanType: Scan["scanType"];
  testPackIds: string[];
  testPackVersions: unknown;
  requestedByUserId: string;
  idempotencyKey: string | null;
  status: Scan["status"];
  phase: Scan["phase"];
  planVersion: number | null;
  plannedCount: number;
  executedCount: number;
  confirmedCount: number;
  startedAt: Date | string | null;
  endedAt: Date | string | null;
  cancelRequestedAt: Date | string | null;
  failureCode: string | null;
  publicDemo: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}): Scan {
  const iso = (value: Date | string): string =>
    value instanceof Date ? value.toISOString() : value;
  const nullableIso = (value: Date | string | null): string | null =>
    value === null ? null : iso(value);
  return {
    id: row.id as Scan["id"],
    workspaceId: row.workspaceId as Scan["workspaceId"],
    projectId: row.projectId as Scan["projectId"],
    scopeId: row.scopeId as Scan["scopeId"],
    sourceSnapshotRef: row.sourceSnapshotRef,
    targetId: row.targetId as Scan["targetId"],
    environmentId: row.environmentId as Scan["environmentId"],
    targetRevision: row.targetRevision,
    fixtureVersion: row.fixtureVersion as Scan["fixtureVersion"],
    scanType: row.scanType,
    testPackIds: row.testPackIds as Scan["testPackIds"],
    testPackVersions: (row.testPackVersions ?? {}) as Scan["testPackVersions"],
    requestedByUserId: row.requestedByUserId as Scan["requestedByUserId"],
    idempotencyKey: row.idempotencyKey as Scan["idempotencyKey"],
    status: row.status,
    phase: row.phase,
    planVersion: row.planVersion,
    plannedCount: row.plannedCount,
    executedCount: row.executedCount,
    confirmedCount: row.confirmedCount,
    startedAt: nullableIso(row.startedAt),
    endedAt: nullableIso(row.endedAt),
    cancelRequestedAt: nullableIso(row.cancelRequestedAt),
    failureCode: row.failureCode,
    publicDemo: row.publicDemo,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export async function createScanFlow(
  deps: BffDeps,
  input: {
    workspaceId: string;
    projectId: string;
    body: unknown;
    idempotencyKey: string | null;
  },
): Promise<RouteResult> {
  const parsed = CreateScanRequestSchema.safeParse(input.body);
  if (!parsed.success) {
    throw new DbError("validation_error", "invalid scan request");
  }
  if (!input.idempotencyKey) {
    throw new DbError("validation_error", "Idempotency-Key header is required");
  }
  await authorizeProject(deps.db, deps.session, input.workspaceId, input.projectId);
  await authorizeWorkspaceMutation(deps.db, deps.session, input.workspaceId, "create-scan");
  assertExecutionBinding(deps.session, {
    projectId: input.projectId,
    targetId: parsed.data.targetId,
    environmentId: parsed.data.environmentId,
  });
  const { scopeHash, targetRevision, fixtureVersion } = await gateExecution(deps, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    targetId: parsed.data.targetId,
    environmentId: parsed.data.environmentId,
    scopeId: parsed.data.authorizationScopeId,
    packIds: [...parsed.data.testPackIds],
    ...(parsed.data.maxDurationSeconds === undefined
      ? {}
      : { maxDurationSeconds: parsed.data.maxDurationSeconds }),
  });
  const versions: Record<string, string> = {};
  for (const packId of parsed.data.testPackIds) {
    versions[packId] = TEST_PACK_MANIFEST[packId].version;
  }
  const requestedBy =
    deps.session.kind === "account" ? deps.session.userId : DEMO_IDS.ownerUserId;
  const created = await createScan(deps.db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    scopeId: parsed.data.authorizationScopeId,
    sourceSnapshotRef: parsed.data.sourceRevision ?? null,
    targetId: parsed.data.targetId,
    environmentId: parsed.data.environmentId,
    targetRevision,
    fixtureVersion,
    scanType: parsed.data.type,
    testPackIds: [...parsed.data.testPackIds],
    testPackVersions: versions,
    requestedByUserId: requestedBy,
    idempotencyKey: input.idempotencyKey,
    publicDemo: deps.session.kind === "demo",
    // Issue #83: atomic admission control — the cap is enforced inside the
    // scan-creation transaction under a per-workspace lock, so a rejected
    // request produces no scan row, no event and no queued job.
    admission: scanAdmissionFor(deps.session),
  });
  // Idempotent retry: a prior `scan.requested` event means this key already
  // created (and possibly already enqueued) the scan. Skip the second history
  // entry, but ALWAYS attempt the enqueue — the singleton key makes it safe,
  // and the first attempt may have crashed before enqueueing.
  const prior = await listScanEvents(deps.db, input.workspaceId, created.id, {
    afterSeq: 0,
  });
  const duplicate = prior.some(
    (event) => event.eventType === "scan.requested",
  );
  if (!duplicate) {
    await appendScanEvent(deps.db, {
      workspaceId: input.workspaceId,
      scanId: created.id,
      eventType: "scan.requested",
      phase: null,
      actorType: deps.session.kind === "account" ? "user" : "system",
      safeSummary: "Scan requested and enqueued for execution",
    });
  }
  try {
    await deps.queue.sendScanJob(
      { workspaceId: input.workspaceId, scanId: created.id },
      {
        singletonKey: input.idempotencyKey,
        singletonSeconds: JOB_ENQUEUE_DEDUPE_SECONDS,
      },
    );
  } catch (error) {
    // Durable fact first: the scan row exists and stays queued. ANY enqueue
    // failure — unconfigured queue, unreachable broker, auth rejection —
    // fails closed with the scan id so the client can retry with the same
    // Idempotency-Key (retries always re-attempt enqueue) instead of
    // receiving a faked success or an id-less 500.
    const unavailable = error instanceof QueueUnavailable;
    return {
      status: duplicate ? 200 : 503,
      body: duplicate
        ? {
            data: {
              scanId: created.id,
              status: "queued" as const,
              note: "duplicate request: existing scan returned, enqueue unavailable",
            },
          }
        : {
            error: {
              code: "unavailable",
              message: unavailable
                ? "scan persisted but the worker queue is not configured; no job was enqueued"
                : "scan persisted but enqueue failed; retry with the same Idempotency-Key",
              details: { scanId: created.id },
            },
          },
    };
  }
  const response = CreateScanResponseSchema.parse({
    scanId: created.id,
    status: "queued",
    eventsUrl: `/api/v1/scans/${created.id}/stream`,
    scopeHash,
    targetRevision,
  });
  return { status: duplicate ? 200 : 202, body: { data: response } };
}

export async function getScanFlow(
  deps: BffDeps,
  input: { scanId: string; workspaceId: string },
): Promise<RouteResult> {
  const row = await getScan(deps.db, input.workspaceId, input.scanId);
  if (!row) throw DbError.notFound("scan", input.scanId);
  await authorizeProject(deps.db, deps.session, input.workspaceId, row.projectId);
  const scopeRow = await getScope(deps.db, input.workspaceId, row.scopeId);
  if (!scopeRow) throw DbError.notFound("authorization_scope", row.scopeId);
  const summary = toScanSummary(mapScanRow(row), {
    oracleVersion: oracleVersionFor(row.testPackIds),
    scopeHash: scopeRow.scopeHash as AuthorizationScope["scopeHash"],
  });
  return { status: 200, body: { data: summary } };
}

export async function listScansFlow(
  deps: BffDeps,
  input: {
    workspaceId: string;
    projectId: string;
    status?: string;
    limit: number;
    cursor?: string;
  },
): Promise<RouteResult> {
  await authorizeProject(deps.db, deps.session, input.workspaceId, input.projectId);
  const rows = await listScans(deps.db, input.workspaceId, {
    projectId: input.projectId,
    ...(input.status === undefined ? {} : { status: input.status }),
    limit: input.limit,
    ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
  });
  const data = await Promise.all(
    rows.map(async (row) => {
      const scopeRow = await getScope(deps.db, input.workspaceId, row.scopeId);
      if (!scopeRow) throw DbError.notFound("authorization_scope", row.scopeId);
      return toScanSummary(mapScanRow(row), {
        oracleVersion: oracleVersionFor(row.testPackIds),
        scopeHash: scopeRow.scopeHash as AuthorizationScope["scopeHash"],
      });
    }),
  );
  return { status: 200, body: { data } };
}

export async function cancelScanFlow(
  deps: BffDeps,
  input: { scanId: string; workspaceId: string },
): Promise<RouteResult> {
  const row = await getScan(deps.db, input.workspaceId, input.scanId);
  if (!row) throw DbError.notFound("scan", input.scanId);
  await authorizeProject(deps.db, deps.session, input.workspaceId, row.projectId);
  await authorizeWorkspaceMutation(deps.db, deps.session, input.workspaceId, "cancel-scan");
  const updated = await requestScanCancel(deps.db, input.workspaceId, input.scanId);
  // Best effort: the DB flag is the mechanism the worker honors, so a dead
  // queue must not block cancellation — but the response says honestly
  // whether the worker was notified.
  const workerNotified = await deps.queue
    .sendCancelScanJob({ workspaceId: input.workspaceId, scanId: updated.id })
    .then(() => true)
    .catch(() => false);
  return {
    status: 200,
    body: {
      data: {
        scanId: updated.id,
        status: updated.status,
        cancelRequestedAt:
          updated.cancelRequestedAt instanceof Date
            ? updated.cancelRequestedAt.toISOString()
            : updated.cancelRequestedAt,
        workerNotified,
      },
    },
  };
}

export async function listAttemptsFlow(
  deps: BffDeps,
  input: { scanId: string; workspaceId: string },
): Promise<RouteResult> {
  const row = await getScan(deps.db, input.workspaceId, input.scanId);
  if (!row) throw DbError.notFound("scan", input.scanId);
  await authorizeProject(deps.db, deps.session, input.workspaceId, row.projectId);
  const attempts = await listAttempts(deps.db, input.workspaceId, input.scanId);
  const toIso = (value: Date | string | null): string | null =>
    value === null ? null : value instanceof Date ? value.toISOString() : value;
  return {
    status: 200,
    body: {
      data: attempts.map((attempt) => ({
        attemptId: attempt.id,
        packId: attempt.packId,
        packVersion: attempt.packVersion,
        status: attempt.status,
        verdict: attempt.verifierVerdict ?? null,
        positiveControlPassed: attempt.positiveControlPassed ?? null,
        negativeSecurityConditionMet: attempt.negativeSecurityConditionMet ?? null,
        startedAt: toIso(attempt.startedAt),
        endedAt: toIso(attempt.endedAt),
      })),
    },
  };
}

export async function listContainmentFlow(
  deps: BffDeps,
  input: { scanId: string; workspaceId: string },
): Promise<RouteResult> {
  const row = await getScan(deps.db, input.workspaceId, input.scanId);
  if (!row) throw DbError.notFound("scan", input.scanId);
  await authorizeProject(deps.db, deps.session, input.workspaceId, row.projectId);
  const events = await listContainmentForScan(
    deps.db,
    input.workspaceId,
    input.scanId,
  );
  const toIso = (value: Date | string): string =>
    value instanceof Date ? value.toISOString() : value;
  return {
    status: 200,
    body: {
      data: events.map((event) => ({
        id: event.id,
        ruleId: event.ruleId,
        deniedOperation: event.deniedOperation,
        allowed: event.allowed,
        runtimeEnforced: event.runtimeEnforced,
        observedAt: toIso(event.observedAt),
        safeMetadata: event.safeMetadata ?? {},
      })),
    },
  };
}

export async function listEventsFlow(
  deps: BffDeps,
  input: { scanId: string; workspaceId: string; after: unknown },
): Promise<RouteResult> {
  const row = await getScan(deps.db, input.workspaceId, input.scanId);
  if (!row) throw DbError.notFound("scan", input.scanId);
  await authorizeProject(deps.db, deps.session, input.workspaceId, row.projectId);
  const parsed = ScanEventsQuerySchema.safeParse({ after: input.after ?? 0 });
  if (!parsed.success) throw new DbError("validation_error", "invalid event cursor");
  const rows = await listScanEvents(deps.db, input.workspaceId, input.scanId, {
    afterSeq: parsed.data.after,
  });
  const data = rows.map((eventRow) => {
    const event = mapScanEvent(eventRow);
    const checked = ScanEventSchema.safeParse(event);
    if (!checked.success) {
      throw new DbError("internal", "stored event failed validation");
    }
    return checked.data;
  });
  return { status: 200, body: { data } };
}
