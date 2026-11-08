/**
 * Issue #71 regression suite (INDEPENDENT, test-only — Engineer 11).
 *
 * Live failure: patched replay `be75fb74...` failed with
 * `conflict: oracle evidence is not attached to a replay attempt` because
 * `executeReplayJob` created an oracle artifact with `attemptId: null` and
 * called `completeReplay` unconditionally even when the replay scan had
 * zero attempts.
 *
 * Contract under test (owned by Engineer 1, worker + L02):
 * - If no real replay-scan attempt exists, do NOT mint oracle evidence and
 *   do NOT call `completeReplay`. Surface a blocked/inconclusive run state
 *   with an observable event instead.
 * - `verified_fixed` requires a real replay attempt AND both oracle legs:
 *   baseline (own read) `pass` AND securityCheck (cross-account denied)
 *   `pass`, with preconditions ok.
 *
 * These tests spy on the store boundary (`createEvidenceArtifact` /
 * `completeReplay`) so they stay green only when the implementation stops
 * manufacturing evidence for attempt-less runs.
 */
import { describe, expect, it, vi } from "vitest";
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
  h.store.scopes.set(SCOPE, makeScope({ permittedEnvironmentId: ENV_PATCHED }) as never);
  const finding = {
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

function spyOnStore(h: ReturnType<typeof buildHarness>) {
  const artifactSpy = vi.spyOn(h.store, "createEvidenceArtifact");
  const completeSpy = vi.spyOn(h.store, "completeReplay");
  return { artifactSpy, completeSpy };
}

describe("issue #71 replay regression", () => {
  it("missing replay attempt: mints no oracle evidence and never verifies", async () => {
    // Sandbox yields no observations -> the replay scan records zero attempts.
    const h = buildHarness({
      sandboxOutcome: {
        kind: "executed",
        runnerId: randomUUID() as never,
        outcome: "failed",
        result: null,
        observations: null,
        containmentEvents: [],
        exitCode: 1,
        resultError: "runner crashed before observations",
      },
    });
    const original = confirmedAttempt(h);
    h.store.attempts.set(original.id, original);
    const replay = await makeReplay(h, original);
    const { artifactSpy, completeSpy } = spyOnStore(h);

    const result = await executeReplayJob(h.deps, {
      workspaceId: h.scan.workspaceId,
      replayId: replay.id,
    });

    expect(result.replayVerdict).not.toBe("verified_fixed");
    // The honest outcome: no fake oracle row, no completion call.
    expect(artifactSpy).not.toHaveBeenCalled();
    expect(completeSpy).not.toHaveBeenCalled();
    const finding = [...h.store.findings.values()][0];
    expect(finding?.remediationStatus).not.toBe("verified_fixed");
  });

  it("expired approval scope: replay scan cannot authorize, no verified_fixed", async () => {
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
    // Scope expired an hour ago: dispatch precheck must fail the scan.
    h.store.scopes.set(
      SCOPE,
      makeScope({
        permittedEnvironmentId: ENV_PATCHED,
        expiresAt: new Date(Date.now() - 3600_000).toISOString(),
      }) as never,
    );
    const finding = {
      id: randomUUID(),
      workspaceId: h.scan.workspaceId,
      projectId: h.scan.projectId,
      stableFingerprint: "bola:invoice_lookup:owner_check",
      confidence: "confirmed_by_execution",
      remediationStatus: "pending_verification",
    };
    h.store.findings.set(finding.id, finding);
    const replay = await h.store.createReplay({
      workspaceId: h.scan.workspaceId,
      projectId: h.scan.projectId,
      findingId: finding.id,
      originalAttemptId: original.id,
      originalScanId: h.scan.id,
      patchedEnvironmentId: ENV_PATCHED,
      patchedRevision: "lab-v2-patched",
      packId: "bola-invoice-v1",
      packVersion: "1.0.0",
      approvalScopeId: h.scan.scopeId,
    });
    const { completeSpy } = spyOnStore(h);

    const result = await executeReplayJob(h.deps, {
      workspaceId: h.scan.workspaceId,
      replayId: replay.id,
    });

    expect(result.replayVerdict).not.toBe("verified_fixed");
    expect(completeSpy).not.toHaveBeenCalled();
  });

  it("patched environment moved: revision mismatch never verifies", async () => {
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
    // Target moved underneath the pinned replay revision.
    h.store.environments.set(ENV_PATCHED, {
      ...h.store.environments.get(ENV_PATCHED)!,
      currentRevision: "lab-v3-hotfix",
    });

    const result = await executeReplayJob(h.deps, {
      workspaceId: h.scan.workspaceId,
      replayId: replay.id,
    });

    expect(result.replayVerdict).not.toBe("verified_fixed");
    const stored = await h.store.getReplay(h.scan.workspaceId, replay.id);
    expect(stored?.verdict).not.toBe("verified_fixed");
  });

  it("wrong image digest: sandbox request carries the pinned digest", async () => {
    const h = buildHarness({
      sandboxOutcome: (call) =>
        executedOutcome({
          attemptId: `r-${call}`,
          observations: makeObservations({
            attemptId: `r-${call}`,
            revision: "lab-v2-patched",
            crossStatus: 403,
            crossBody: { error: "forbidden" },
          }),
        }),
    });
    const original = confirmedAttempt(h);
    h.store.attempts.set(original.id, original);
    const replay = await makeReplay(h, original);

    await executeReplayJob(h.deps, {
      workspaceId: h.scan.workspaceId,
      replayId: replay.id,
    });

    expect(h.sandbox.calls.length).toBeGreaterThan(0);
    for (const call of h.sandbox.calls) {
      expect((call.request as { targetImageDigest?: string }).targetImageDigest).toBe(
        h.deps.config.targetImageDigest,
      );
    }
  });

  it("retry/idempotency: second run skips without re-executing", async () => {
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

    const first = await executeReplayJob(h.deps, {
      workspaceId: h.scan.workspaceId,
      replayId: replay.id,
    });
    const callsAfterFirst = h.sandbox.calls.length;
    const second = await executeReplayJob(h.deps, {
      workspaceId: h.scan.workspaceId,
      replayId: replay.id,
    });

    expect(first.status).toBe("completed");
    expect(second.status).toBe("skipped");
    expect(h.sandbox.calls).toHaveLength(callsAfterFirst);
  });

  it("incomplete oracle evidence: unknown legs never verify", async () => {
    for (const crossStatus of [500, 302]) {
      const h = buildHarness({
        sandboxOutcome: () =>
          executedOutcome({
            attemptId: "r",
            observations: makeObservations({
              attemptId: "r",
              revision: "lab-v2-patched",
              crossStatus,
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

      expect(result.replayVerdict, `crossStatus=${crossStatus}`).not.toBe("verified_fixed");
    }
  });

  it("verified_fixed requires a real replay attempt plus both legs", async () => {
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

    // Positive path still possible when everything is real.
    expect(result.replayVerdict).toBe("verified_fixed");
    const replayScan = [...h.store.scans.values()].find(
      (s) => s.scanType === "replay_verification",
    );
    expect(replayScan).toBeDefined();
    const attempts = await h.store.listAttempts(h.scan.workspaceId, replayScan!.id);
    expect(attempts.length).toBeGreaterThan(0);
    const artifact = h.store.evidence.find(
      (e) => (e as { artifactKind?: string }).artifactKind === "oracle",
    ) as unknown as { attemptId: string };
    expect(artifact?.attemptId).toBe(attempts[0]!.id);
  });
});
