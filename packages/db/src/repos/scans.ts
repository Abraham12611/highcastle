import { and, desc, eq, gt, lt, notInArray, sql } from "drizzle-orm";
import type { Database, DbExecutor, DbTransaction } from "../client.js";
import {
  authorizationScopes,
  environments,
  scanAdmissions,
  scanEvents,
  scans,
  isTerminalScanStatus,
  TERMINAL_SCAN_STATUSES,
} from "../schema/tables.js";
import { DbError } from "../errors.js";

/** Allowed scan lifecycle transitions (spec § Scan lifecycle). */
const SCAN_TRANSITIONS: Record<string, readonly string[]> = {
  draft: ["preflight", "canceled"],
  preflight: ["awaiting_approval", "queued", "canceled"],
  awaiting_approval: ["queued", "canceled"],
  queued: ["preparing", "canceled"],
  preparing: ["recon", "failed", "canceled"],
  recon: ["planning", "failed", "canceled"],
  planning: ["executing", "verifying", "failed", "canceled"],
  executing: ["verifying", "failed", "canceled"],
  verifying: ["planning", "finalizing", "completed", "partial", "failed", "canceled"],
  finalizing: ["completed", "partial", "failed", "canceled"],
  completed: [],
  partial: [],
  failed: [],
  canceled: [],
};

export function isAllowedScanTransition(from: string, to: string): boolean {
  return SCAN_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Scan admission control (issue #83).
 *
 * Ceilings are enforced INSIDE the scan-creation transaction under a
 * per-workspace advisory lock, so concurrent requests on any number of
 * connections serialize and cannot race past the limits. A rejected request
 * rolls back — no scan row, no ledger row, no queued job.
 */

export interface ScanAdmissionWindow {
  /** Maximum NEW scans the subject may start inside the window. */
  maxPerWindow: number;
  windowSeconds: number;
}

export interface ScanAdmissionSubject {
  /**
   * Server-derived actor identity (`demo:<sessionId>`,
   * `account:<userId>`, `worker:<kind>`). Never a client-supplied header.
   */
  key: string;
  windows: ScanAdmissionWindow[];
}

export interface ScanAdmissionLimits {
  maxActivePerProject: number;
  maxActivePerWorkspace: number;
  maxActivePerTarget: number;
}

export interface ScanAdmission {
  /** Partial overrides merge over {@link DEFAULT_SCAN_ADMISSION_LIMITS}. */
  limits?: Partial<ScanAdmissionLimits>;
  subject?: ScanAdmissionSubject;
}

/**
 * Fail-closed ceilings for the 2 GB Vultr demo VM. Every `createScan` call
 * is held to these even when the caller passes no explicit policy, so the
 * worker replay-scan path is covered too; the BFF tightens per-session
 * budgets on top via `subject`.
 */
export const DEFAULT_SCAN_ADMISSION_LIMITS: ScanAdmissionLimits = {
  maxActivePerProject: 5,
  maxActivePerWorkspace: 8,
  maxActivePerTarget: 5,
};

export interface CreateScanInput {
  workspaceId: string;
  projectId: string;
  scopeId: string;
  sourceSnapshotRef?: string | null;
  targetId: string;
  environmentId?: string | null;
  targetRevision: string;
  fixtureVersion?: string | null;
  scanType?: "targeted_red_team" | "baseline_check" | "replay_verification";
  testPackIds: string[];
  testPackVersions?: Record<string, string>;
  requestedByUserId: string;
  idempotencyKey?: string | null;
  publicDemo?: boolean;
  admission?: ScanAdmission;
}

/**
 * Create a scan after verifying the authorization snapshot: the scope must
 * exist in this workspace, be `active`, be unexpired, and reference the same
 * project/target. Idempotent when `idempotencyKey` is set — a replayed
 * request returns the original scan row instead of inserting a duplicate.
 *
 * Admission control (issue #83): inside this same transaction a
 * per-workspace advisory lock serializes all scan creation, then
 * {@link enforceScanAdmission} applies the active-scan ceilings and
 * per-subject windows atomically — concurrent requests cannot race past a
 * cap, and a rejected request leaves no scan row, no ledger row and no job.
 */
export async function createScan(db: Database, input: CreateScanInput) {
  return db.transaction(async (tx) => {
    const findExisting = () =>
      tx
        .select()
        .from(scans)
        .where(
          and(
            eq(scans.workspaceId, input.workspaceId),
            eq(scans.idempotencyKey, input.idempotencyKey ?? ""),
          ),
        )
        .limit(1);

    if (input.idempotencyKey) {
      const existing = await findExisting();
      if (existing[0]) return existing[0];
    }

    // Serialize admissions per workspace: the check-then-insert below is
    // only race-free while holding this transaction-scoped lock, which
    // releases automatically on commit or rollback (issue #83).
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${"scan_admission:" + input.workspaceId}, 0))`,
    );

    // A same-key request that lost the lock race sees the winner's scan now
    // and returns it — never a second insert, never consumed budget.
    if (input.idempotencyKey) {
      const existing = await findExisting();
      if (existing[0]) return existing[0];
    }

    const [scope] = await tx
      .select()
      .from(authorizationScopes)
      .where(
        and(
          eq(authorizationScopes.id, input.scopeId),
          eq(authorizationScopes.workspaceId, input.workspaceId),
        ),
      )
      .limit(1);
    if (!scope) throw DbError.notFound("authorization_scope", input.scopeId);
    if (scope.status !== "active") {
      throw new DbError("scope_denied", `authorization scope is ${scope.status}`, {
        scopeId: input.scopeId,
      });
    }
    if (scope.expiresAt.getTime() <= Date.now()) {
      throw new DbError("scope_denied", "authorization scope has expired", {
        scopeId: input.scopeId,
      });
    }
    if (scope.projectId !== input.projectId || scope.targetId !== input.targetId) {
      throw new DbError("scope_denied", "scope does not authorize this project/target", {
        scopeId: input.scopeId,
      });
    }

    // Execution environment: the scan must run in the scope's permitted
    // environment (mirrors L04 `checkScopeRelations`: permitted env only).
    const environmentId = input.environmentId ?? scope.permittedEnvironmentId;
    if (environmentId !== scope.permittedEnvironmentId) {
      throw new DbError("scope_denied", "scan environment is outside the authorized scope", {
        scopeId: input.scopeId,
      });
    }
    const [env] = await tx
      .select()
      .from(environments)
      .where(
        and(
          eq(environments.id, environmentId),
          eq(environments.workspaceId, input.workspaceId),
          eq(environments.projectId, input.projectId),
        ),
      )
      .limit(1);
    if (!env) throw DbError.notFound("environment", environmentId);
    if (env.provisionStatus !== "ready") {
      throw new DbError(
        "unprocessable",
        `environment provision status ${env.provisionStatus} is not ready`,
        { environmentId },
      );
    }
    // Revision pin: evidence is attributed to the environment's current
    // revision — a scan naming any other revision is stale by construction.
    if (input.targetRevision !== env.currentRevision) {
      throw new DbError(
        "stale_revision",
        `scan revision ${input.targetRevision} does not match environment revision ${env.currentRevision}`,
        { environmentId },
      );
    }

    // Test-pack allowlist: the model/scan may only narrow to approved packs.
    const unapproved = input.testPackIds.filter((pack) => !scope.allowedTestPackIds.includes(pack));
    if (unapproved.length > 0) {
      throw new DbError(
        "scope_denied",
        `test packs not authorized by scope: ${unapproved.join(", ")}`,
        { scopeId: input.scopeId },
      );
    }

    const admission = input.admission ?? {
      limits: DEFAULT_SCAN_ADMISSION_LIMITS,
    };
    await enforceScanAdmission(tx as DbTransaction, input, admission);

    const [row] = await tx
      .insert(scans)
      .values({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        scopeId: input.scopeId,
        sourceSnapshotRef: input.sourceSnapshotRef ?? null,
        targetId: input.targetId,
        environmentId,
        targetRevision: input.targetRevision,
        fixtureVersion: input.fixtureVersion ?? null,
        scanType: input.scanType ?? "targeted_red_team",
        testPackIds: input.testPackIds,
        testPackVersions: input.testPackVersions ?? {},
        requestedByUserId: input.requestedByUserId,
        idempotencyKey: input.idempotencyKey ?? null,
        status: "queued",
        publicDemo: input.publicDemo ?? false,
      })
      .returning();
    if (!row) throw new DbError("internal", "scan insert returned no row");
    if (admission.subject) {
      await tx.insert(scanAdmissions).values({
        workspaceId: input.workspaceId,
        subject: admission.subject.key,
        idempotencyKey: input.idempotencyKey ?? null,
        scanId: row.id,
      });
    }
    return row;
  });
}

async function countRows(tx: DbTransaction, conditions: ReturnType<typeof and>): Promise<number> {
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(scans)
    .where(conditions);
  return row?.count ?? 0;
}

/**
 * Admission gate evaluated under the workspace advisory lock. Ceilings use
 * `quota_exceeded` (429); subject rate windows use `rate_limited` (429).
 */
async function enforceScanAdmission(
  tx: DbTransaction,
  input: CreateScanInput,
  admission: ScanAdmission,
): Promise<void> {
  const limits: ScanAdmissionLimits = {
    ...DEFAULT_SCAN_ADMISSION_LIMITS,
    ...admission.limits,
  };
  const { subject } = admission;
  const active = notInArray(scans.status, [...TERMINAL_SCAN_STATUSES]);

  const projectActive = await countRows(
    tx,
    and(eq(scans.workspaceId, input.workspaceId), eq(scans.projectId, input.projectId), active),
  );
  if (projectActive >= limits.maxActivePerProject) {
    throw new DbError(
      "quota_exceeded",
      `project active scan limit reached (${projectActive}/${limits.maxActivePerProject})`,
      { scope: "project", active: projectActive, limit: limits.maxActivePerProject },
    );
  }
  const workspaceActive = await countRows(
    tx,
    and(eq(scans.workspaceId, input.workspaceId), active),
  );
  if (workspaceActive >= limits.maxActivePerWorkspace) {
    throw new DbError(
      "quota_exceeded",
      `workspace active scan limit reached (${workspaceActive}/${limits.maxActivePerWorkspace})`,
      { scope: "workspace", active: workspaceActive, limit: limits.maxActivePerWorkspace },
    );
  }
  const targetActive = await countRows(
    tx,
    and(eq(scans.workspaceId, input.workspaceId), eq(scans.targetId, input.targetId), active),
  );
  if (targetActive >= limits.maxActivePerTarget) {
    throw new DbError(
      "quota_exceeded",
      `target active scan limit reached (${targetActive}/${limits.maxActivePerTarget})`,
      { scope: "target", active: targetActive, limit: limits.maxActivePerTarget },
    );
  }

  if (subject) {
    for (const window of subject.windows) {
      const [row] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(scanAdmissions)
        .where(
          and(
            eq(scanAdmissions.workspaceId, input.workspaceId),
            eq(scanAdmissions.subject, subject.key),
            gt(
              scanAdmissions.createdAt,
              sql`now() - make_interval(secs => ${window.windowSeconds})`,
            ),
          ),
        );
      const admitted = row?.count ?? 0;
      if (admitted >= window.maxPerWindow) {
        throw new DbError(
          "rate_limited",
          `scan admission limit reached for this session (${admitted}/${window.maxPerWindow} per ${window.windowSeconds}s)`,
          {
            scope: "subject",
            admitted,
            limit: window.maxPerWindow,
            windowSeconds: window.windowSeconds,
          },
        );
      }
    }
  }
}

export interface ScanAdmissionSnapshot {
  workspaceActive: number;
  perProject: Record<string, number>;
  perTarget: Record<string, number>;
}

/**
 * Current admission pressure for health/monitoring surfaces (issue #83):
 * non-terminal scans are the capacity consumers behind every ceiling.
 */
export async function scanAdmissionSnapshot(
  db: DbExecutor,
  workspaceId: string,
): Promise<ScanAdmissionSnapshot> {
  const rows = await db
    .select({
      projectId: scans.projectId,
      targetId: scans.targetId,
      count: sql<number>`count(*)::int`,
    })
    .from(scans)
    .where(
      and(
        eq(scans.workspaceId, workspaceId),
        notInArray(scans.status, [...TERMINAL_SCAN_STATUSES]),
      ),
    )
    .groupBy(scans.projectId, scans.targetId);
  const snapshot: ScanAdmissionSnapshot = {
    workspaceActive: 0,
    perProject: {},
    perTarget: {},
  };
  for (const row of rows) {
    snapshot.workspaceActive += row.count;
    snapshot.perProject[row.projectId] =
      (snapshot.perProject[row.projectId] ?? 0) + row.count;
    snapshot.perTarget[row.targetId] =
      (snapshot.perTarget[row.targetId] ?? 0) + row.count;
  }
  return snapshot;
}

/** Tenant-scoped read. */
export async function getScan(db: DbExecutor, workspaceId: string, scanId: string) {
  const rows = await db
    .select()
    .from(scans)
    .where(and(eq(scans.id, scanId), eq(scans.workspaceId, workspaceId)))
    .limit(1);
  return rows[0] ?? null;
}

export interface ListScansOptions {
  projectId?: string;
  status?: string;
  limit?: number;
  cursor?: string;
}

/** Cursor = ISO timestamp of the last row's `created_at` (descending). */
export async function listScans(
  db: DbExecutor,
  workspaceId: string,
  options: ListScansOptions = {},
) {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const conditions = [eq(scans.workspaceId, workspaceId)];
  if (options.projectId) conditions.push(eq(scans.projectId, options.projectId));
  if (options.cursor) {
    conditions.push(lt(scans.createdAt, new Date(options.cursor)));
  }
  return db
    .select()
    .from(scans)
    .where(and(...conditions))
    .orderBy(desc(scans.createdAt))
    .limit(limit + 1);
}

export interface ScanTransition {
  to:
    | "draft"
    | "preflight"
    | "awaiting_approval"
    | "queued"
    | "preparing"
    | "recon"
    | "planning"
    | "executing"
    | "verifying"
    | "finalizing"
    | "completed"
    | "partial"
    | "failed"
    | "canceled";
  phase?: "preparing" | "recon" | "planning" | "executing" | "verifying" | "finalizing" | null;
  planVersion?: number | null;
  plannedCount?: number;
  executedCount?: number;
  confirmedCount?: number;
  failureCode?: string | null;
}

/**
 * Move a scan along the lifecycle. Illegal transitions throw `conflict`;
 * terminal scans reject every transition. `startedAt`/`endedAt` are derived
 * here, never supplied by callers.
 */
export async function transitionScan(
  db: DbExecutor,
  workspaceId: string,
  scanId: string,
  transition: ScanTransition,
) {
  const existing = await getScan(db, workspaceId, scanId);
  if (!existing) throw DbError.notFound("scan", scanId);
  if (isTerminalScanStatus(existing.status)) {
    throw DbError.conflict(`scan is already terminal (${existing.status})`, {
      scanId,
    });
  }
  if (!isAllowedScanTransition(existing.status, transition.to)) {
    throw DbError.conflict(`illegal scan transition ${existing.status} -> ${transition.to}`, {
      scanId,
    });
  }
  const now = new Date();
  const patch: Partial<typeof scans.$inferInsert> = {
    status: transition.to,
    updatedAt: now,
  };
  if (transition.phase !== undefined) patch.phase = transition.phase;
  if (transition.planVersion !== undefined) patch.planVersion = transition.planVersion;
  if (transition.plannedCount !== undefined) patch.plannedCount = transition.plannedCount;
  if (transition.executedCount !== undefined) patch.executedCount = transition.executedCount;
  if (transition.confirmedCount !== undefined) patch.confirmedCount = transition.confirmedCount;
  if (transition.failureCode !== undefined) patch.failureCode = transition.failureCode;
  if (existing.startedAt === null && transition.to !== "queued") {
    patch.startedAt = now;
  }
  if (isTerminalScanStatus(transition.to)) patch.endedAt = now;
  const [row] = await db
    .update(scans)
    .set(patch)
    .where(
      and(
        eq(scans.id, scanId),
        eq(scans.workspaceId, workspaceId),
        eq(scans.status, existing.status),
      ),
    )
    .returning();
  if (!row) {
    throw DbError.conflict("scan was modified concurrently", { scanId });
  }
  return row;
}

/**
 * Flag a scan for cancellation. The worker observes the flag, terminates
 * the runner, then moves the scan to `canceled` via `transitionScan`
 * (which records the terminal `scan.canceled` event in the same tx).
 */
export async function requestScanCancel(db: DbExecutor, workspaceId: string, scanId: string) {
  const existing = await getScan(db, workspaceId, scanId);
  if (!existing) throw DbError.notFound("scan", scanId);
  if (isTerminalScanStatus(existing.status)) {
    throw DbError.conflict(`scan is already terminal (${existing.status})`, {
      scanId,
    });
  }
  const [row] = await db
    .update(scans)
    .set({ cancelRequestedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(scans.id, scanId), eq(scans.workspaceId, workspaceId)))
    .returning();
  if (!row) throw DbError.notFound("scan", scanId);
  return row;
}

// --- Durable scan events ---

export interface AppendEventInput {
  workspaceId: string;
  scanId: string;
  eventType:
    | "workspace.created"
    | "project.created"
    | "source.connected"
    | "target.verified"
    | "scope.approved"
    | "scan.requested"
    | "scan.started"
    | "scan.stage.updated"
    | "scan.cancel_requested"
    | "scan.canceled"
    | "test.approval_required"
    | "test.plan.validated"
    | "test.executed"
    | "sandbox.action_blocked"
    | "finding.confirmed"
    | "scan.completed"
    | "scan.failed"
    | "remediation.created"
    | "replay.completed"
    | "finding.verified_fixed"
    | "github.pr.updated"
    | "schedule.due"
    | "integration.revoked"
    | "workspace.emergency_stopped";
  phase?: "preparing" | "recon" | "planning" | "executing" | "verifying" | "finalizing" | null;
  actorType: "user" | "model" | "worker" | "policy" | "runner" | "oracle" | "operator" | "system";
  safeSummary: string;
  payloadRedacted?: Record<string, unknown>;
  attemptId?: string | null;
}

const MAX_SEQ_RETRIES = 8;

/**
 * Append a durable event with the next monotonic `seq` for the scan.
 * Concurrent writers serialize on the scan row (`FOR UPDATE`) and retry on
 * unique-violation, so parallel `appendScanEvent` calls always produce a
 * gapless 1..N sequence — never duplicates, never lost writes.
 */
export async function appendScanEvent(db: Database, input: AppendEventInput) {
  if (!input.safeSummary || input.safeSummary.length > 280) {
    throw new DbError("validation_error", "safeSummary must be 1..280 chars");
  }
  let lastError: unknown = null;
  for (let attempt = 0; attempt < MAX_SEQ_RETRIES; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        const scan = await tx
          .select({ id: scans.id, workspaceId: scans.workspaceId })
          .from(scans)
          .where(and(eq(scans.id, input.scanId), eq(scans.workspaceId, input.workspaceId)))
          .limit(1)
          .for("update");
        if (!scan[0]) throw DbError.notFound("scan", input.scanId);
        const [maxRow = { max: null }] = await tx
          .select({ max: sql<number | string | null>`max(${scanEvents.seq})` })
          .from(scanEvents)
          .where(eq(scanEvents.scanId, input.scanId));
        // node-postgres returns int8 aggregates as strings while PGlite
        // returns numbers — coerce before incrementing, or `max + 1`
        // silently becomes string concatenation ("1" + 1 = "11").
        const maxRaw = maxRow.max;
        const max = typeof maxRaw === "string" ? Number.parseInt(maxRaw, 10) : (maxRaw ?? 0);
        const [row] = await tx
          .insert(scanEvents)
          .values({
            workspaceId: input.workspaceId,
            scanId: input.scanId,
            seq: (max ?? 0) + 1,
            eventType: input.eventType,
            phase: input.phase ?? null,
            actorType: input.actorType,
            safeSummary: input.safeSummary,
            payloadRedacted: input.payloadRedacted ?? {},
            attemptId: input.attemptId ?? null,
          })
          .returning();
        if (!row) throw new DbError("internal", "event insert returned no row");
        return row;
      });
    } catch (error) {
      lastError = error;
      if (error instanceof DbError) throw error;
      if (!isUniqueViolation(error) || attempt === MAX_SEQ_RETRIES - 1) throw error;
    }
  }
  throw lastError;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "23505"
  );
}

export interface ListEventsOptions {
  afterSeq?: number;
  limit?: number;
}

/** Ordered event history for SSE rehydrate (`afterSeq` = Last-Event-ID). */
export async function listScanEvents(
  db: DbExecutor,
  workspaceId: string,
  scanId: string,
  options: ListEventsOptions = {},
) {
  const scan = await getScan(db, workspaceId, scanId);
  if (!scan) throw DbError.notFound("scan", scanId);
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const conditions = [eq(scanEvents.scanId, scanId), eq(scanEvents.workspaceId, workspaceId)];
  if (options.afterSeq !== undefined) {
    conditions.push(gt(scanEvents.seq, options.afterSeq));
  }
  return db
    .select()
    .from(scanEvents)
    .where(and(...conditions))
    .orderBy(scanEvents.seq)
    .limit(limit);
}
