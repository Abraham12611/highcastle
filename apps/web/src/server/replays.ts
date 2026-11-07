import { ReplayRequestSchema, type ScanId } from "@highcastle/contracts";
import {
  createReplay,
  getAttempt,
  getFinding,
  getReplay,
  getScan,
  listAttempts,
  listReplaysForFinding,
} from "@highcastle/db";
import { DbError } from "@highcastle/db";
import type { BffDeps } from "./deps";
import {
  assertDemoExecutionBinding,
  authorizeProject,
  loadExecutionScope,
} from "./authz";
import { mapEnvironment } from "./mappers";
import { QueueUnavailable } from "./queue";
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
  const original = await getAttempt(
    deps.db,
    input.workspaceId,
    parsed.data.originalAttemptId,
  );
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
  if (deps.session.kind === "guest") {
    assertDemoExecutionBinding({
      projectId: input.projectId,
      targetId: originalScan.targetId,
      environmentId: parsed.data.patchedEnvironmentId,
    });
  }
  const loaded = await loadExecutionScope(
    deps.db,
    input.workspaceId,
    input.projectId,
    originalScan.targetId,
    parsed.data.patchedEnvironmentId,
    parsed.data.authorizationScopeId,
  );
  const patchedEnv = mapEnvironment(loaded.environment);
  if (parsed.data.patchedRevision !== patchedEnv.currentRevision) {
    throw new DbError("stale_revision", "patched revision does not match the environment", {
      expected: patchedEnv.currentRevision,
    });
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
    approvalScopeId: parsed.data.authorizationScopeId,
  });
  try {
    await deps.queue.sendReplayJob(replay.id);
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


