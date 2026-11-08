import { ReplayRequestSchema, type ScanId } from "@highcastle/contracts";
import {
  createAuthorizationScope,
  createReplay,
  createTarget,
  getAttempt,
  getEnvironment,
  getFinding,
  getReplay,
  getScan,
  getScope,
  listAttempts,
  listReplaysForFinding,
  targets,
  verifyTarget,
} from "@highcastle/db";
import { and, eq } from "drizzle-orm";
import { DbError } from "@highcastle/db";
import type { BffDeps } from "./deps";
import { assertExecutionBinding, authorizeProject } from "./authz";
import { mapEnvironment } from "./mappers";
import { JOB_ENQUEUE_DEDUPE_SECONDS, QueueUnavailable } from "./queue";
import type { RouteResult } from "./scans";

/**
 * Replay flows. A replay re-executes the SAME versioned pack against a
 * patched revision and only the deterministic oracle may award
 * `verified_fixed` — the API never accepts a client verdict.
 */

export async function createReplayFlow(
  deps: BffDeps,
  input: {
    workspaceId: string;
    projectId: string;
    findingId: string;
    body: unknown;
  },
): Promise<RouteResult> {
  const parsed = ReplayRequestSchema.safeParse(input.body);
  if (!parsed.success) {
    throw new DbError("validation_error", "invalid replay request");
  }
  await authorizeProject(deps.db, deps.session, input.workspaceId, input.projectId);
  const finding = await getFinding(deps.db, input.workspaceId, input.findingId);
  if (!finding) throw DbError.notFound("finding", input.findingId);
  if (finding.projectId !== input.projectId) {
    throw DbError.notFound("finding", input.findingId);
  }
  const original = await getAttempt(deps.db, input.workspaceId, parsed.data.originalAttemptId);
  if (!original) {
    throw DbError.notFound("test_attempt", parsed.data.originalAttemptId);
  }
  // Replays require stored original oracle evidence — and only a reproduced
  // observation is worth re-proving against a patch.
  if (original.verifierVerdict !== "reproduced") {
    throw new DbError(
      "unprocessable",
      "replay requires an original attempt with a reproduced oracle verdict",
      { attemptId: original.id },
    );
  }
  const originalScan = await getScan(deps.db, input.workspaceId, original.scanId);
  if (!originalScan) throw DbError.notFound("scan", original.scanId);
  if (original.packId !== "bola-invoice-v1") {
    throw new DbError("unprocessable", "replay supports the BOLA pack only", {
      packId: original.packId,
    });
  }
  assertExecutionBinding(deps.session, {
    projectId: input.projectId,
    targetId: originalScan.targetId,
    environmentId: parsed.data.patchedEnvironmentId,
  });
  // --- Resolve the patched-environment authorization triple ------------
  // L04's relation gate requires scope.targetId === scan.targetId AND
  // target.environmentId === scan.environmentId — a replay scope must bind
  // a target that lives in the PATCHED environment, never the original
  // vulnerable-env target. Find-or-create that patched target, then bind a
  // NEW immutable scope with the same user-approved grant bounds (never a
  // mutation of the original approval, never a silently wider grant).
  const [patchedTargetRow] = await deps.db
    .select()
    .from(targets)
    .where(
      and(
        eq(targets.workspaceId, input.workspaceId),
        eq(targets.projectId, input.projectId),
        eq(targets.environmentId, parsed.data.patchedEnvironmentId),
      ),
    )
    .limit(1);
  let patchedTarget = patchedTargetRow;
  if (!patchedTarget) {
    const created = await createTarget(deps.db, {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      environmentId: parsed.data.patchedEnvironmentId,
      label: `${originalScan.targetId}-patched`,
      canonicalOrigin: "https://target-lab.internal",
      targetKind: "demo",
    });
    patchedTarget = await verifyTarget(deps.db, input.workspaceId, created.id, {
      method: "synthetic_lab_attestation",
      verifiedBy: input.projectId,
    });
  }
  // Demo sessions stay pinned to the fixed triple — a replay provisions a
  // patched-env binding but cannot widen what the operator approved.
  const environment = await getEnvironment(
    deps.db,
    input.workspaceId,
    parsed.data.patchedEnvironmentId,
  );
  if (!environment) throw DbError.notFound("environment", parsed.data.patchedEnvironmentId);
  const patchedEnv = mapEnvironment(environment);
  if (parsed.data.patchedRevision !== patchedEnv.currentRevision) {
    throw new DbError("stale_revision", "patched revision does not match the environment", {
      expected: patchedEnv.currentRevision,
    });
  }

  // Prefer a client-presented scope that already authorizes the patched
  // triple exactly; otherwise mint a fresh, correctly-hashed one carrying
  // the ORIGINAL approval's grant bounds (packs/methods/paths/caps/host).
  const originalScope = await getScope(deps.db, input.workspaceId, originalScan.scopeId);
  if (!originalScope) throw DbError.notFound("authorization_scope", originalScan.scopeId);
  let approvalScopeId = parsed.data.authorizationScopeId;
  const presented = approvalScopeId
    ? await getScope(deps.db, input.workspaceId, approvalScopeId)
    : null;
  const presentedValid =
    presented !== null &&
    presented.projectId === input.projectId &&
    presented.targetId === patchedTarget.id &&
    presented.permittedEnvironmentId === parsed.data.patchedEnvironmentId;
  if (!presentedValid) {
    const provisioned = await createAuthorizationScope(deps.db, {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      targetId: patchedTarget.id,
      actorUserId: originalScope.actorUserId,
      allowedHosts: originalScope.allowedHosts,
      allowedPaths: originalScope.allowedPaths,
      deniedPaths: originalScope.deniedPaths ?? [],
      allowedTestPackIds: originalScope.allowedTestPackIds,
      allowedMethods: originalScope.allowedMethods,
      maxDurationSeconds: originalScope.maxDurationSeconds,
      maxRequests: originalScope.maxRequests,
      maxConcurrency: originalScope.maxConcurrency,
      maxMemoryMb: originalScope.maxMemoryMb,
      maxCpuMillicores: originalScope.maxCpuMillicores,
      networkProfileId: originalScope.networkProfileId,
      permittedEnvironmentId: parsed.data.patchedEnvironmentId,
      expiresAt: originalScope.expiresAt,
    });
    approvalScopeId = provisioned.id as typeof approvalScopeId;
  }

  const replay = await createReplay(deps.db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    findingId: input.findingId,
    originalAttemptId: original.id,
    originalScanId: original.scanId,
    patchedEnvironmentId: parsed.data.patchedEnvironmentId,
    patchedRevision: parsed.data.patchedRevision,
    packId: "bola-invoice-v1",
    packVersion: original.packVersion,
    approvalScopeId,
  });
  try {
    await deps.queue.sendReplayJob(
      { workspaceId: input.workspaceId, replayId: replay.id },
      {
        singletonKey: replay.id,
        singletonSeconds: JOB_ENQUEUE_DEDUPE_SECONDS,
      },
    );
  } catch (error) {
    // Fail closed with the replay id on ANY enqueue failure so the client
    // can recover; never fake success or return an id-less 500.
    const unavailable = error instanceof QueueUnavailable;
    return {
      status: 503,
      body: {
        error: {
          code: "unavailable",
          message: unavailable
            ? "replay persisted but the worker queue is not configured; no job was enqueued"
            : "replay persisted but enqueue failed; retry the replay request",
          details: { replayId: replay.id },
        },
      },
    };
  }
  return {
    status: 202,
    body: {
      data: {
        replayId: replay.id,
        findingId: replay.findingId,
        verdict: replay.verdict,
        patchedRevision: replay.patchedRevision,
      },
    },
  };
}

export async function getReplayFlow(
  deps: BffDeps,
  input: { replayId: string; workspaceId: string },
): Promise<RouteResult> {
  const replay = await getReplay(deps.db, input.workspaceId, input.replayId);
  if (!replay) throw DbError.notFound("replay", input.replayId);
  await authorizeProject(deps.db, deps.session, input.workspaceId, replay.projectId);
  const [originalAttempt, replayAttempts, history] = await Promise.all([
    getAttempt(deps.db, input.workspaceId, replay.originalAttemptId),
    replay.replayScanId
      ? listAttempts(deps.db, input.workspaceId, replay.replayScanId as ScanId)
      : Promise.resolve([]),
    listReplaysForFinding(deps.db, input.workspaceId, replay.findingId),
  ]);
  void history;
  return {
    status: 200,
    body: {
      data: {
        id: replay.id,
        findingId: replay.findingId,
        verdict: replay.verdict,
        patchedRevision: replay.patchedRevision,
        packId: replay.packId,
        packVersion: replay.packVersion,
        positiveAssertionPassed: replay.positiveAssertionPassed,
        negativeAssertionPassed: replay.negativeAssertionPassed,
        originalAttempt: originalAttempt
          ? {
              id: originalAttempt.id,
              packId: originalAttempt.packId,
              verdict: originalAttempt.verifierVerdict,
            }
          : null,
        replayAttempts: replayAttempts.map((attempt) => ({
          id: attempt.id,
          packId: attempt.packId,
          verdict: attempt.verifierVerdict,
        })),
      },
    },
  };
}
