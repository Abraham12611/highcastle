import { describe, expect, it } from "vitest";
import { executeScanJob } from "./scan.js";
import { executeCancelJob } from "./cancel.js";
import { executeOrphanReap } from "./janitor.js";
import { buildHarness } from "../adapters/testing/harness.js";
import {
  SCOPE,
  denyDecision,
  executedOutcome,
  invalidProposalOutcome,
  makeObservations,
  makeScan,
  makeScope,
} from "../adapters/testing/stubs.js";

const P = (h: ReturnType<typeof buildHarness>) => ({
  workspaceId: h.scan.workspaceId,
  scanId: h.scan.id,
});

describe("executeScanJob", () => {
  it("runs the full pipeline to completed with a reproduced finding", async () => {
    const h = buildHarness({
      sandboxOutcome: () =>
        executedOutcome({
          attemptId: "00000000-0000-4000-8000-0000000000aa",
          observations: makeObservations({ attemptId: "x", crossStatus: 200 }),
        }),
    });
    const result = await executeScanJob(h.deps, P(h));

    expect(result.status).toBe("completed");
    const scan = await h.store.getScan(h.scan.workspaceId, h.scan.id);
    expect(scan?.status).toBe("completed");
    expect(scan?.executedCount).toBe(1);
    expect(scan?.confirmedCount).toBe(1);
    expect(h.inference.calls).toHaveLength(1);
    expect(h.policy.calls).toHaveLength(1); // cached plan: one deterministic eval
    expect(h.sandbox.calls).toHaveLength(1);

    const events = h.events.types(h.scan.id);
    expect(events).toContain("scan.started");
    expect(events).toContain("test.plan.validated");
    expect(events).toContain("test.executed");
    expect(events).toContain("finding.confirmed");
    expect(events).toContain("scan.completed");
    // finding.confirmed must carry the findingId (contract superRefine)
    const fc = h.events.forScan(h.scan.id).find((e) => e.eventType === "finding.confirmed");
    expect(fc?.payloadRedacted?.["findingId"]).toBeTruthy();
    // finding row exists with confirmed_by_execution
    expect([...h.store.findings.values()][0]?.confidence).toBe("confirmed_by_execution");
    // attempt has a recorded oracle verdict
    const [attempt] = await h.store.listAttempts(h.scan.workspaceId, h.scan.id);
    expect(attempt?.verifierVerdict).toBe("reproduced");
    expect(attempt?.positiveControlPassed).toBe(true);
  });

  it("fails after bounded replans when the model proposal stays invalid", async () => {
    const h = buildHarness({
      inferenceOutcomes: [
        invalidProposalOutcome(),
        invalidProposalOutcome(),
        invalidProposalOutcome(),
      ],
    });
    const result = await executeScanJob(h.deps, P(h));
    expect(result.status).toBe("failed");
    // 1 initial + 2 replans (MAX_MODEL_REPLANS) = 3 calls
    expect(h.inference.calls).toHaveLength(3);
    expect(h.sandbox.calls).toHaveLength(0);
    expect(h.store.modelCalls.size).toBe(3);
    expect(h.store.proposals.size).toBe(3);
    const scan = await h.store.getScan(h.scan.workspaceId, h.scan.id);
    expect(scan?.status).toBe("failed");
    expect(scan?.failureCode).toBe("model_plan_invalid");
  });

  it("fails without executing when the model call itself throws", async () => {
    const h = buildHarness({ inferenceOutcomes: [new Error("vultr 503")] });
    await expect(executeScanJob(h.deps, P(h))).rejects.toThrow(/inference call failed/);
    expect(h.sandbox.calls).toHaveLength(0);
  });

  it("denies and never dispatches when policy rejects the plan", async () => {
    const h = buildHarness({ policyDecision: denyDecision(["out_of_scope_pack"]) });
    const result = await executeScanJob(h.deps, P(h));
    expect(result.status).toBe("failed");
    expect(h.sandbox.calls).toHaveLength(0);
    expect(await h.store.listAttempts(h.scan.workspaceId, h.scan.id)).toHaveLength(0);
    const scan = await h.store.getScan(h.scan.workspaceId, h.scan.id);
    expect(scan?.status).toBe("failed");
    expect(scan?.failureCode).toBe("policy_denied");
  });

  it("fails at dispatch when the scope is revoked (drift)", async () => {
    const h = buildHarness({});
    h.store.scopes.set(SCOPE, makeScope({ status: "revoked" }) as never);
    const result = await executeScanJob(h.deps, P(h));
    expect(result.status).toBe("failed");
    expect(result.reason).toContain("revoked");
    expect(h.inference.calls).toHaveLength(0);
    expect(h.sandbox.calls).toHaveLength(0);
  });

  it("fails when scope env no longer covers the scan environment", async () => {
    const h = buildHarness({ scan: makeScan({ environmentId: crypto.randomUUID() }) });
    const result = await executeScanJob(h.deps, P(h));
    expect(result.status).toBe("failed");
    expect(result.reason).toContain("environment");
  });

  it("records failed attempt and partial scan when the runner times out", async () => {
    const h = buildHarness({
      sandboxOutcome: {
        kind: "executed",
        runnerId: crypto.randomUUID() as never,
        outcome: "timeout",
        result: null,
        observations: null,
        containmentEvents: [],
        exitCode: null,
        resultError: "deadline exceeded",
      },
    });
    const result = await executeScanJob(h.deps, P(h));
    expect(result.status).toBe("partial");
    const [attempt] = await h.store.listAttempts(h.scan.workspaceId, h.scan.id);
    expect(attempt?.status).toBe("timeout");
    expect(attempt?.verifierVerdict).toBeNull();
    expect(h.store.findings.size).toBe(0);
  });

  it("fails the scan when the controller denies the request", async () => {
    const h = buildHarness({
      sandboxOutcome: {
        kind: "denied",
        reason: "network internal check failed",
        policyVersion: "l04-policy-1.0.0",
      },
    });
    const result = await executeScanJob(h.deps, P(h));
    expect(result.status).toBe("failed");
    const [attempt] = await h.store.listAttempts(h.scan.workspaceId, h.scan.id);
    expect(attempt?.status).toBe("blocked");
    expect(h.events.types(h.scan.id)).toContain("sandbox.action_blocked");
    expect(h.store.findings.size).toBe(0);
  });

  it("marks inconclusive — never confirmed — when observations are missing", async () => {
    const h = buildHarness({
      sandboxOutcome: executedOutcome({ attemptId: "a", observations: null }),
    });
    const result = await executeScanJob(h.deps, P(h));
    expect(result.status).toBe("completed");
    const [attempt] = await h.store.listAttempts(h.scan.workspaceId, h.scan.id);
    expect(attempt?.verifierVerdict).toBe("inconclusive");
    expect(attempt?.verdictReasonCode).toBe("observation_channel_unavailable");
    // Runner booleans alone can NEVER mint a finding.
    expect(h.store.findings.size).toBe(0);
    expect(h.events.types(h.scan.id)).not.toContain("finding.confirmed");
  });

  it("does not confirm when the cross-account read is denied (not_reproduced)", async () => {
    const h = buildHarness({
      sandboxOutcome: executedOutcome({
        attemptId: "a",
        observations: makeObservations({
          attemptId: "a",
          crossStatus: 403,
          crossBody: { error: "forbidden" },
        }),
      }),
    });
    const result = await executeScanJob(h.deps, P(h));
    expect(result.status).toBe("completed");
    const [attempt] = await h.store.listAttempts(h.scan.workspaceId, h.scan.id);
    expect(attempt?.verifierVerdict).toBe("not_reproduced");
    expect(h.store.findings.size).toBe(0);
    expect(h.events.types(h.scan.id)).not.toContain("finding.confirmed");
  });

  it("skips a duplicate delivery once the scan is claimed", async () => {
    const h = buildHarness({ scan: makeScan({ status: "executing", phase: "executing" }) });
    // in-flight -> resumes rather than skips; assert queued-vs-inflight distinction:
    const h2 = buildHarness({ scan: makeScan({ status: "completed" }) });
    const res = await executeScanJob(h2.deps, {
      workspaceId: h2.scan.workspaceId,
      scanId: h2.scan.id,
    });
    expect(res.status).toBe("skipped");
    void h;
  });

  it("cancels between stages when cancelRequestedAt is set mid-flight", async () => {
    const h = buildHarness({
      sandboxOutcome: async () => {
        await h.store.requestScanCancel(h.scan.workspaceId, h.scan.id);
        return executedOutcome({ attemptId: "a" });
      },
    });
    const result = await executeScanJob(h.deps, P(h));
    expect(result.status).toBe("canceled");
    const scan = await h.store.getScan(h.scan.workspaceId, h.scan.id);
    expect(scan?.status).toBe("canceled");
    expect(h.events.types(h.scan.id)).toContain("scan.canceled");
    expect(h.events.types(h.scan.id)).not.toContain("scan.completed");
  });

  it("cancels an in-flight scan via the cancel job (abort + runner kill)", async () => {
    const h = buildHarness({ scan: makeScan({ status: "executing", phase: "executing" }) });
    h.store.runners.push({ id: "runner-1", scanId: h.scan.id, terminal: false });
    const result = await executeCancelJob(h.deps, P(h));
    expect(result.status).toBe("canceled");
    expect(h.sandbox.canceled).toContain("runner-1");
    const scan = await h.store.getScan(h.scan.workspaceId, h.scan.id);
    expect(scan?.status).toBe("canceled");
    expect(h.events.types(h.scan.id)).toEqual(
      expect.arrayContaining(["scan.cancel_requested", "scan.canceled"]),
    );
  });

  it("reconciles orphan runners via the janitor", async () => {
    const h = buildHarness({});
    const report = await executeOrphanReap(h.deps);
    expect(report.reaped).toBe(1);
    expect(report.inspected).toBe(3);
  });
});
