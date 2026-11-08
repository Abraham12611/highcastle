import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { executeReplayJob } from "./replay.js";
import { buildHarness } from "../adapters/testing/harness.js";
import {
  ENV_PATCHED,
  SCOPE,
  executedOutcome,
  makeObservations,
  makeScope,
} from "../adapters/testing/stubs.js";
import type { AttemptRecord } from "../adapters/ports.js";

function confirmedAttempt(h: ReturnType<typeof buildHarness>): AttemptRecord {
  return {
    id: randomUUID(),
    workspaceId: h.scan.workspaceId,
    scanId: h.scan.id,
    packId: "bola-invoice-v1",
    packVersion: "1.0.0",
    proposalId: null,
    planHash: "ph",
    scopeHash: "sh",
    attemptNumber: 1,
    status: "completed",
    oracleVersion: "bola-oracle-v1",
    verifierVerdict: "reproduced",
    verdictReasonCode: null,
    positiveControlPassed: true,
    negativeSecurityConditionMet: true,
    startedAt: new Date(),
    endedAt: new Date(),
  };
}

async function makeReplay(h: ReturnType<typeof buildHarness>, originalAttempt: AttemptRecord) {
  // The replay's approval scope must permit the PATCHED environment —
  // authorization never carries over implicitly.
  h.store.scopes.set(SCOPE, makeScope({ permittedEnvironmentId: ENV_PATCHED }) as never);
  const finding = [...h.store.findings.values()][0] ?? {
    id: randomUUID(),
    workspaceId: h.scan.workspaceId,
    projectId: h.scan.projectId,
    stableFingerprint: "bola:invoice_lookup:owner_check",
    confidence: "confirmed_by_execution",
    remediationStatus: "pending_verification",
  };
  h.store.findings.set(finding.id, finding);
  return h.store.createReplay({
    workspaceId: h.scan.workspaceId,
    projectId: h.scan.projectId,
    findingId: finding.id,
    originalAttemptId: originalAttempt.id,
    originalScanId: h.scan.id,
    patchedEnvironmentId: ENV_PATCHED,
    patchedRevision: "lab-v2-patched",
    packId: "bola-invoice-v1",
    packVersion: "1.0.0",
    approvalScopeId: h.scan.scopeId,
  });
}

describe("executeReplayJob", () => {
  it("verified_fixed when patched run denies cross-account AND keeps own read", async () => {
    const h = buildHarness({
      sandboxOutcome: () =>
        executedOutcome({
          attemptId: "r",
          observations: makeObservations({
            attemptId: "r",
            revision: "lab-v2-patched",
            crossStatus: 403,
            crossBody: { error: "forbidden" },
          }),
        }),
    });
    const original = confirmedAttempt(h);
    h.store.attempts.set(original.id, original);
    const replay = await makeReplay(h, original);

    const result = await executeReplayJob(h.deps, {
      workspaceId: h.scan.workspaceId,
      replayId: replay.id,
    });

    expect(result.replayVerdict).toBe("verified_fixed");
    const finding = [...h.store.findings.values()][0];
    expect(finding?.remediationStatus).toBe("verified_fixed");
    // replay created its own replay_verification scan that ran to completion
    const replayScan = [...h.store.scans.values()].find(
      (s) => s.scanType === "replay_verification",
    );
    expect(replayScan?.status).toBe("completed");
    expect(replayScan?.targetRevision).toBe("lab-v2-patched");
    // inference was NOT invoked for a pinned replay
    expect(h.inference.calls).toHaveLength(0);
    expect(h.events.types(replayScan!.id)).toContain("replay.completed");
  });

  it("still_vulnerable when the patched run reproduces the read", async () => {
    const h = buildHarness({
      sandboxOutcome: () =>
        executedOutcome({
          attemptId: "r",
          observations: makeObservations({
            attemptId: "r",
            revision: "lab-v2-patched",
            crossStatus: 200,
          }),
        }),
    });
    const original = confirmedAttempt(h);
    h.store.attempts.set(original.id, original);
    const replay = await makeReplay(h, original);

    const result = await executeReplayJob(h.deps, {
      workspaceId: h.scan.workspaceId,
      replayId: replay.id,
    });
    expect(result.replayVerdict).toBe("still_vulnerable");
    const finding = [...h.store.findings.values()][0];
    expect(finding?.remediationStatus).not.toBe("verified_fixed");
  });

  it("fails visibly when the original attempt was never confirmed", async () => {
    const h = buildHarness({});
    const unconfirmed: AttemptRecord = {
      ...confirmedAttempt(h),
      verifierVerdict: "inconclusive",
      positiveControlPassed: null,
    };
    h.store.attempts.set(unconfirmed.id, unconfirmed);
    const replay = await makeReplay(h, unconfirmed);

    await expect(
      executeReplayJob(h.deps, {
        workspaceId: h.scan.workspaceId,
        replayId: replay.id,
      }),
    ).rejects.toThrow("replay cannot complete: original attempt was not confirmed");
    // Honest: no dangling oracle artifact, no sandbox work, visible reason.
    expect(h.sandbox.calls).toHaveLength(0);
    expect(h.store.evidence).toHaveLength(0);
    const events = h.events.events.filter((e) => e.eventType === "scan.stage.updated");
    expect(events.some((e) => e.safeSummary.includes("not confirmed"))).toBe(true);
  });

  it("fails visibly when the replay scan produces no attempt", async () => {
    const h = buildHarness({});
    const replay = await makeReplay(h, confirmedAttempt(h));
    // Scan fails pre-execution (policy deny/expired scope): no attempt row.
    h.deps.sandbox = {
      execute: async () => ({ kind: "denied", reason: "x", policyVersion: "p" }),
      cancel: async () => {},
      reconcileOrphans: async () => ({ inspected: 0, reaped: [], markedLost: [], errors: [] }),
    };
    await expect(
      executeReplayJob(h.deps, {
        workspaceId: h.scan.workspaceId,
        replayId: replay.id,
      }),
    ).rejects.toThrow("replay cannot complete");
    expect(h.store.evidence).toHaveLength(0);
  });

  it("skips an already-completed replay (idempotent)", async () => {
    const h = buildHarness({});
    const replay = await makeReplay(h, confirmedAttempt(h));
    h.store.replays.set(replay.id, { ...replay, verdict: "verified_fixed" });
    const result = await executeReplayJob(h.deps, {
      workspaceId: h.scan.workspaceId,
      replayId: replay.id,
    });
    expect(result.status).toBe("skipped");
    expect(h.sandbox.calls).toHaveLength(0);
  });
});
