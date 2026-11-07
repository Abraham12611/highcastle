/**
 * `replay.execute` — patched-target verification of a confirmed finding.
 *
 * Invariants (contracts/replay.ts + issue):
 * - SAME versioned pack as the original attempt, patched environment/revision.
 * - `verified_fixed` requires BOTH oracle legs on the patched run: own read
 *   passes AND cross-account read denied. The verdict is derived by L02's
 *   `completeReplay` from recorded observations — never supplied by us.
 * - Original evidence is preserved; the replay only appends a new attempt.
 * - If the original attempt was never confirmed-by-execution, the replay
 *   completes `inconclusive` — a replay cannot manufacture a confirmation.
 */
import type { OrchestratorDeps } from "./deps.js";
import { emit } from "./events.js";
import { executeScanJob } from "./scan.js";
import type { AttemptAdjudication, ReplayRecord } from "../adapters/ports.js";

export interface ReplayJobPayload {
  workspaceId: string;
  replayId: string;
}

export interface ReplayJobResult {
  status: "completed" | "failed" | "skipped";
  replayVerdict?: string;
  reason?: string;
}

export async function executeReplayJob(
  deps: OrchestratorDeps,
  payload: ReplayJobPayload,
): Promise<ReplayJobResult> {
  const { workspaceId, replayId } = payload;
  const replay = await deps.store.getReplay(workspaceId, replayId);
  if (!replay) throw new Error(`replay ${replayId} not found in workspace`);

  if (replay.verdict !== null) {
    return { status: "skipped", reason: `already ${replay.verdict}` };
  }

  const [finding, originalAttempt] = await Promise.all([
    deps.store.getFinding(workspaceId, replay.findingId),
    deps.store.getAttempt(workspaceId, replay.originalAttemptId),
  ]);
  if (!finding) throw new Error(`finding ${replay.findingId} missing`);

  // Precondition: the replay only means something against a confirmed
  // reproduction. Anything else completes inconclusive immediately.
  const preconditionOk =
    originalAttempt !== null &&
    originalAttempt.verifierVerdict === "reproduced" &&
    originalAttempt.positiveControlPassed === true;

  let adjudication: AttemptAdjudication | null = null;
  let replayScanId: string | null = replay.replayScanId;

  if (preconditionOk) {
    replayScanId = await ensureReplayScan(deps, replay);
    if (replayScanId) {
      const scanResult = await executeScanJob(
        deps,
        { workspaceId, scanId: replayScanId },
        {
          pinnedPlan: {
            packId: replay.packId,
            packVersion: replay.packVersion,
          },
        },
      );
      if (scanResult.status === "completed" || scanResult.status === "partial") {
        adjudication = await latestAdjudication(deps, workspaceId, replayScanId);
      }
    }
  }

  const { replayVerdict } = await deps.verifier.adjudicateReplay(
    adjudication ?? {
      attemptId: replay.originalAttemptId,
      oracleVersion: "unavailable",
      baseline: "unknown",
      securityCheck: "unknown",
      verdict: "inconclusive",
      preconditionsOk: false,
      reasons: preconditionOk
        ? ["replay execution did not produce a complete adjudication"]
        : ["original attempt was not confirmed by execution"],
    },
  );

  const completed = await deps.store.completeReplay(workspaceId, replayId, {
    legitimateRead: adjudication?.baseline ?? "unknown",
    unauthorizedReadDenied: adjudication?.securityCheck ?? "unknown",
    stillReadsCrossAccount: adjudication?.verdict === "reproduced",
  });

  // Events are emitted on the replay scan when present, else the original.
  const eventScanId = replayScanId ?? replay.originalScanId;
  await emit(deps, {
    workspaceId,
    scanId: eventScanId,
    eventType: "replay.completed",
    phase: "finalizing",
    actorType: "oracle",
    safeSummary: `replay adjudicated ${replayVerdict} on ${replay.patchedRevision}`,
    payloadRedacted: { replayId, replayVerdict },
  });
  if (replayVerdict === "verified_fixed") {
    await emit(deps, {
      workspaceId,
      scanId: eventScanId,
      eventType: "finding.verified_fixed",
      phase: "finalizing",
      actorType: "oracle",
      safeSummary: "patched replay: own read passed and cross-account read denied",
      payloadRedacted: { findingId: replay.findingId, replayId },
    });
  }

  return {
    status: "completed",
    replayVerdict: completed.verdict ?? replayVerdict,
  };
}

/** Re-derive the attempt adjudication persisted during the replay scan. */
async function latestAdjudication(
  deps: OrchestratorDeps,
  workspaceId: string,
  scanId: string,
): Promise<AttemptAdjudication | null> {
  const attempts = await deps.store.listAttempts(workspaceId, scanId);
  const latest = attempts.sort((a, b) => b.attemptNumber - a.attemptNumber)[0];
  if (!latest || latest.verifierVerdict === null) return null;
  return {
    attemptId: latest.id,
    oracleVersion: latest.oracleVersion ?? "unknown",
    baseline:
      latest.positiveControlPassed === true
        ? "pass"
        : latest.positiveControlPassed === false
          ? "fail"
          : "unknown",
    securityCheck:
      latest.negativeSecurityConditionMet === true
        ? "pass"
        : latest.negativeSecurityConditionMet === false
          ? "fail"
          : "unknown",
    verdict: latest.verifierVerdict,
    preconditionsOk: latest.positiveControlPassed === true,
    reasons: [latest.verdictReasonCode ?? "recorded adjudication"],
  };
}

/**
 * The replay runs under its own `replay_verification` scan (durable state +
 * events). L18 may have already created it (`replayScanId`); otherwise the
 * worker opens one bound to the patched environment and approval scope.
 */
async function ensureReplayScan(
  deps: OrchestratorDeps,
  replay: ReplayRecord,
): Promise<string | null> {
  if (replay.replayScanId) return replay.replayScanId;
  if (!replay.approvalScopeId || !replay.patchedEnvironmentId) {
    // No scope/env captured at replay request time — cannot authorize.
    return null;
  }
  const originalScan = await deps.store.getScan(replay.workspaceId, replay.originalScanId);
  const environment = await deps.store.getEnvironment(
    replay.workspaceId,
    replay.patchedEnvironmentId,
  );
  if (!originalScan || !environment) return null;

  const scan = await deps.store.createReplayScan({
    workspaceId: replay.workspaceId,
    projectId: replay.projectId,
    scopeId: replay.approvalScopeId,
    targetId: originalScan.targetId,
    environmentId: replay.patchedEnvironmentId,
    targetRevision: replay.patchedRevision,
    fixtureVersion: environment.fixtureVersion,
    testPackIds: [replay.packId],
    testPackVersions: { [replay.packId]: replay.packVersion },
    requestedByUserId: originalScan.requestedByUserId,
    idempotencyKey: `replay-scan:${replay.id}`,
  });
  return scan.id;
}
