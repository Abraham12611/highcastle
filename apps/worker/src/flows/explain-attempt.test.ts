import { describe, expect, it, vi } from "vitest";
import type { ExplanationResult } from "@highcastle/inference";
import { buildHarness } from "../adapters/testing/harness.js";
import { ALLOW_DECISION, executedOutcome } from "../adapters/testing/stubs.js";
import type { ApprovedPlan } from "./execute-attempt.js";
import { runAttempt } from "./execute-attempt.js";

/**
 * Post-oracle explanation hook (Engineer 8).
 *
 * - A reproduced run persists a validated explanation and keeps its verdict.
 * - Model transport failure, invalid output, and missing evidence never
 *   change the attempt outcome or the oracle verdict.
 * - The model receives only trusted summaries + persisted evidence IDs.
 */

const APPROVAL = ALLOW_DECISION as ApprovedPlan;

function validExplanationResult(attemptId: string, evidenceIds: string[]): ExplanationResult {
  return {
    explanation: {
      explanationVersion: 1,
      summary: "Alice read Bob's invoice because the lookup ignored ownership.",
      whatHappened: "The lab looked the invoice up by id alone.",
      whyVerdict: "The cross-account read returned HTTP 200 with Bob's data.",
      replayMeaning: null,
      verdictEcho: "reproduced",
      attemptIdEcho: attemptId,
      evidenceIds,
      followUp: null,
    },
    validationStatus: "valid",
    rejectionCode: null,
    issues: [],
    rawExplanationRedacted: { summary: "redacted" },
    metadata: {
      provider: "vultr",
      model: "live-model-x",
      responseModel: "live-model-x",
      requestId: "req-live-1",
      latencyMs: 42,
      tokensInput: 10,
      tokensOutput: 20,
      outcome: "success",
      errorCode: null,
    },
  };
}

function invalidExplanationResult(): ExplanationResult {
  return {
    explanation: null,
    validationStatus: "invalid",
    rejectionCode: "verdict_override",
    issues: ["model echoed a different verdict"],
    rawExplanationRedacted: null,
    metadata: {
      provider: "vultr",
      model: "live-model-x",
      responseModel: "live-model-x",
      requestId: "req-live-2",
      latencyMs: 42,
      tokensInput: 10,
      tokensOutput: 20,
      outcome: "malformed",
      errorCode: "policy_conflict",
    },
  };
}

describe("post-oracle explanation hook", () => {
  it("persists a validated explanation and keeps the reproduced verdict", async () => {
    const h = buildHarness({});
    const seen: unknown[] = [];
    h.deps.sandbox = {
      calls: [],
      canceled: [],
      async execute(request: { attemptId: string }) {
        return executedOutcome({ attemptId: request.attemptId });
      },
      async cancel() {},
      async reconcileOrphans() {
        return { inspected: 0, reaped: [], markedLost: [], errors: [] };
      },
    } as never;
    h.deps.explainer = {
      generateExplanation: vi.fn(async (input: unknown) => {
        seen.push(input);
        const attemptId = (input as { attemptId: string }).attemptId;
        const evidenceIds = (input as { evidenceRefs: { evidenceId: string }[] }).evidenceRefs.map(
          (r) => r.evidenceId,
        );
        return validExplanationResult(attemptId, evidenceIds);
      }),
    };

    const result = await runAttempt(h.deps, {
      workspaceId: h.scan.workspaceId,
      scanId: h.scan.id,
      approval: APPROVAL,
      proposalId: null,
      scopeHash: "scope-test",
      targetRevision: "lab-v1-vulnerable",
      attemptNumber: 1,
    });

    expect(result.outcome).toBe("completed");
    expect(result.reproduced).toBe(true);
    expect(result.adjudication?.verdict).toBe("reproduced");
    // Exactly one model call, grounded in the real attempt + persisted evidence.
    expect(h.deps.explainer).toBeDefined();
    expect(seen).toHaveLength(1);
    const sent = seen[0] as { attemptId: string; oracleVerdict: string; observationSummaries: string[] };
    expect(sent.attemptId).toBe(result.attempt.id);
    expect(sent.oracleVerdict).toBe("reproduced");
    expect(sent.observationSummaries.length).toBeGreaterThan(0);
    expect(JSON.stringify(sent)).not.toContain("INV-");
    // Stored row links the same attempt and verdict.
    expect(h.store.explanations.size).toBe(1);
    const stored = [...h.store.explanations.values()][0];
    expect(stored?.attemptId).toBe(result.attempt.id);
    expect(stored?.oracleVerdict).toBe("reproduced");
    // The attempt row itself is untouched by the explanation.
    const reread = await h.store.getAttempt(h.scan.workspaceId, result.attempt.id);
    expect(reread?.verifierVerdict).toBe("reproduced");
  });

  it("keeps scan success and verdict when the model call fails", async () => {
    const h = buildHarness({});
    h.deps.sandbox = {
      calls: [],
      canceled: [],
      async execute(request: { attemptId: string }) {
        return executedOutcome({ attemptId: request.attemptId });
      },
      async cancel() {},
      async reconcileOrphans() {
        return { inspected: 0, reaped: [], markedLost: [], errors: [] };
      },
    } as never;
    h.deps.explainer = {
      generateExplanation: vi.fn(async () => {
        throw new Error("vultr timeout");
      }),
    };

    const result = await runAttempt(h.deps, {
      workspaceId: h.scan.workspaceId,
      scanId: h.scan.id,
      approval: APPROVAL,
      proposalId: null,
      scopeHash: "scope-test",
      targetRevision: "lab-v1-vulnerable",
      attemptNumber: 1,
    });

    expect(result.outcome).toBe("completed");
    expect(result.reproduced).toBe(true);
    expect(result.adjudication?.verdict).toBe("reproduced");
    expect(h.store.explanations.size).toBe(0);
  });

  it("never persists a rejected model verdict override", async () => {
    const h = buildHarness({});
    h.deps.sandbox = {
      calls: [],
      canceled: [],
      async execute(request: { attemptId: string }) {
        return executedOutcome({ attemptId: request.attemptId });
      },
      async cancel() {},
      async reconcileOrphans() {
        return { inspected: 0, reaped: [], markedLost: [], errors: [] };
      },
    } as never;
    h.deps.explainer = {
      generateExplanation: vi.fn(async () => invalidExplanationResult()),
    };

    const result = await runAttempt(h.deps, {
      workspaceId: h.scan.workspaceId,
      scanId: h.scan.id,
      approval: APPROVAL,
      proposalId: null,
      scopeHash: "scope-test",
      targetRevision: "lab-v1-vulnerable",
      attemptNumber: 1,
    });

    expect(result.outcome).toBe("completed");
    expect(result.adjudication?.verdict).toBe("reproduced");
    expect(h.store.explanations.size).toBe(0);
  });

  it("skips the model call when no persisted evidence grounds it", async () => {
    const h = buildHarness({});
    h.deps.sandbox = {
      calls: [],
      canceled: [],
      async execute(request: { attemptId: string }) {
        return executedOutcome({ attemptId: request.attemptId, observations: null });
      },
      async cancel() {},
      async reconcileOrphans() {
        return { inspected: 0, reaped: [], markedLost: [], errors: [] };
      },
    } as never;
    const generateExplanation = vi.fn(async () => validExplanationResult("x", []));
    h.deps.explainer = { generateExplanation };

    const result = await runAttempt(h.deps, {
      workspaceId: h.scan.workspaceId,
      scanId: h.scan.id,
      approval: APPROVAL,
      proposalId: null,
      scopeHash: "scope-test",
      targetRevision: "lab-v1-vulnerable",
      attemptNumber: 1,
    });

    expect(result.outcome).toBe("completed");
    expect(result.adjudication?.verdict).toBe("inconclusive");
    expect(generateExplanation).not.toHaveBeenCalled();
    expect(h.store.explanations.size).toBe(0);
  });
});
