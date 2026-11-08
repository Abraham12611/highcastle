import { describe, expect, it } from "vitest";
import { adjudicateAttempt } from "@highcastle/test-packs";
import { toScanSummary } from "@highcastle/contracts";
import { executeScanJob } from "./scan.js";
import { executeCancelJob } from "./cancel.js";
import { buildHarness } from "../adapters/testing/harness.js";
import { executedOutcome, makeObservations, makeScan } from "../adapters/testing/stubs.js";

const P = (h: ReturnType<typeof buildHarness>) => ({
  workspaceId: h.scan.workspaceId,
  scanId: h.scan.id,
});

function flush(times = 20) {
  return (async () => {
    for (let i = 0; i < times; i += 1) await Promise.resolve();
  })();
}

describe("orphaned scan recovery (issue #91)", () => {
  it("duplicate delivery while an attempt runs does not double-execute", async () => {
    let release!: (v: ReturnType<typeof executedOutcome>) => void;
    const gate = new Promise<ReturnType<typeof executedOutcome>>((r) => {
      release = r;
    });
    const h = buildHarness({ sandboxOutcome: () => gate });
    const first = executeScanJob(h.deps, P(h));
    for (let i = 0; i < 50 && h.sandbox.calls.length === 0; i += 1) {
      await flush();
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(h.sandbox.calls).toHaveLength(1);

    const duplicate = await executeScanJob(h.deps, P(h));
    expect(duplicate.status).toBe("skipped");
    expect(duplicate.reason).toMatch(/already running/);
    expect(h.sandbox.calls).toHaveLength(1);

    release(executedOutcome({ attemptId: "a" }));
    const result = await first;
    expect(result.status).toBe("completed");
    expect(await h.store.listAttempts(h.scan.workspaceId, h.scan.id)).toHaveLength(1);
    expect(h.store.findings.size).toBe(1);
  });

  it("kill cancels the in-flight scan and restart after crash re-runs once", async () => {
    let release!: (v: ReturnType<typeof executedOutcome>) => void;
    const gate = new Promise<ReturnType<typeof executedOutcome>>((r) => {
      release = r;
    });
    let calls = 0;
    const h = buildHarness({
      sandboxOutcome: () => {
        calls += 1;
        if (calls === 1) return gate;
        return executedOutcome({ attemptId: "restart" });
      },
    });
    const first = executeScanJob(h.deps, P(h));
    for (let i = 0; i < 50 && h.sandbox.calls.length === 0; i += 1) {
      await flush();
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(h.sandbox.calls).toHaveLength(1);

    // Simulate a crashed owner: the running attempt is older than its lease.
    const [running] = await h.store.listAttempts(h.scan.workspaceId, h.scan.id);
    expect(running?.status).toBe("running");
    const stored = h.store.attempts.get(running!.id);
    h.store.attempts.set(running!.id, {
      ...stored!,
      startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    });

    // A lost container means the dead owner's sandbox call never resolves;
    // the restart takes over with exactly one bounded re-run.
    const restart = await executeScanJob(h.deps, P(h));
    expect(restart.status).toBe("completed");
    expect(h.sandbox.calls).toHaveLength(2);

    // Late event from the dead owner must not overwrite the terminal scan.
    release(executedOutcome({ attemptId: "stale", resultStatus: "timeout" }));
    await first;
    const scan = await h.store.getScan(h.scan.workspaceId, h.scan.id);
    expect(scan?.status).toBe("completed");
    expect(scan?.failureCode).toBeNull();
  });

  it("cancel while parked in execution terminates via the cancel job", async () => {
    const h = buildHarness({
      sandboxOutcome: () => new Promise<never>(() => undefined),
    });
    const first = executeScanJob(h.deps, P(h));
    for (let i = 0; i < 50 && h.sandbox.calls.length === 0; i += 1) {
      await flush();
      await new Promise((r) => setTimeout(r, 5));
    }
    const canceled = await executeCancelJob(h.deps, P(h));
    expect(canceled.status).toBe("canceled");
    const scan = await h.store.getScan(h.scan.workspaceId, h.scan.id);
    expect(scan?.status).toBe("canceled");
    expect(h.events.types(h.scan.id)).toContain("scan.canceled");
    void first;
  });

  it("lost job (sandbox throws) fails terminal with execution_failed; redelivery skips", async () => {
    const h = buildHarness({
      sandboxOutcome: () => {
        throw new Error("container vanished mid-run");
      },
    });
    const result = await executeScanJob(h.deps, P(h));
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("execution_failed");
    const scan = await h.store.getScan(h.scan.workspaceId, h.scan.id);
    expect(scan?.status).toBe("failed");
    expect(scan?.failureCode).toBe("execution_failed");
    expect(h.store.findings.size).toBe(0);

    const redelivery = await executeScanJob(h.deps, P(h));
    expect(redelivery.status).toBe("skipped");
  });

  it("stale executing scan past the bounded age fails with execution_timeout", async () => {
    const h = buildHarness({
      scan: makeScan({
        status: "executing",
        phase: "executing",
        startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      }),
      sandboxOutcome: () => {
        throw new Error("must never execute a timed-out scan");
      },
    });
    const result = await executeScanJob(h.deps, P(h));
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("execution_timeout");
    expect(h.sandbox.calls).toHaveLength(0);
    const scan = await h.store.getScan(h.scan.workspaceId, h.scan.id);
    expect(scan?.status).toBe("failed");
    expect(scan?.failureCode).toBe("execution_timeout");
  });

  it("containment breach fails closed with a failure code and no finding", async () => {
    const h = buildHarness({
      sandboxOutcome: {
        kind: "executed",
        runnerId: "00000000-0000-4000-8000-0000000000b1" as never,
        outcome: "containment_breach",
        result: null,
        observations: null,
        containmentEvents: [],
        exitCode: null,
        resultError: null,
      },
    });
    const result = await executeScanJob(h.deps, P(h));
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("containment_breach");
    const scan = await h.store.getScan(h.scan.workspaceId, h.scan.id);
    expect(scan?.failureCode).toBe("containment_breach");
    expect(h.store.findings.size).toBe(0);
  });

  it("precondition failure preserves the sandbox reason and scan failureCode in the summary", async () => {
    const h = buildHarness({
      sandboxOutcome: {
        kind: "precondition_failed",
        reason: "target image digest mismatch: pinned deadbeef but running lab image is cafef00d",
      },
    });
    const result = await executeScanJob(h.deps, P(h));
    expect(result.status).toBe("failed");
    const scan = await h.store.getScan(h.scan.workspaceId, h.scan.id);
    expect(scan?.failureCode).toBe("sandbox_precondition");
    const failed = h.events.forScan(h.scan.id).find((e) => e.eventType === "scan.failed");
    expect(failed?.safeSummary).toMatch(/digest mismatch/);
    expect(failed?.payloadRedacted?.["reason"]).toMatch(/digest mismatch/);
    const summary = toScanSummary(scan!, {
      oracleVersion: "bola-oracle-v1",
      scopeHash: "a".repeat(64),
    });
    expect(summary.failureCode).toBe("sandbox_precondition");
    expect(summary.terminal).toBe(true);
  });

  it("target revision drift mid-run is inconclusive, never confirmed", async () => {
    const h = buildHarness({
      sandboxOutcome: () =>
        executedOutcome({
          attemptId: "drift",
          observations: makeObservations({ attemptId: "drift", revision: "lab-v2-patched" }),
        }),
    });
    // Real oracle: revision echo mismatch forces preconditionsOk=false.
    h.deps.verifier = {
      adjudicate: async (obs) =>
        adjudicateAttempt({
          attemptId: obs.attemptId,
          expectedRevision: obs.expectedRevision as never,
          health: obs.health,
          ready: obs.ready,
          meta: obs.meta,
          ownInvoice: obs.ownInvoice,
          crossInvoice: obs.crossInvoice,
        }) as never,
      adjudicateReplay: async (patchedRun) => h.verifier.adjudicateReplay(patchedRun),
    };
    const result = await executeScanJob(h.deps, P(h));
    expect(result.status).toBe("completed");
    const [attempt] = await h.store.listAttempts(h.scan.workspaceId, h.scan.id);
    expect(attempt?.verifierVerdict).toBe("inconclusive");
    expect(h.store.findings.size).toBe(0);
  });
});
