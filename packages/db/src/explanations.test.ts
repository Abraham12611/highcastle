import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createFixtureChain, createTestDb, type TestDb } from "./test-utils.js";
import { createScan } from "./repos/scans.js";
import { listExplanationsForAttempt, recordExplanation } from "./repos/explanations.js";

/**
 * Post-execution explanation persistence (Engineer 8, issue #55).
 *
 * - Success and safe-failure rows both persist with full provider metadata.
 * - The recorded oracle verdict is the caller's persisted verdict; the
 *   table has no path for a model-claimed verdict.
 * - Rows are scoped to (workspace, scan, attempt).
 */
describe("model explanations", () => {
  let tdb: TestDb;
  beforeAll(async () => {
    tdb = await createTestDb();
  });
  afterAll(async () => {
    await tdb.close();
  });
  afterEach(async () => {
    await tdb.reset();
  });

  async function openScan() {
    const f = await createFixtureChain(tdb.db);
    const scan = await createScan(tdb.db, {
      workspaceId: f.workspaceId,
      projectId: f.projectId,
      scopeId: f.scopeId,
      targetId: f.targetId,
      environmentId: f.environmentId,
      targetRevision: f.envRevision,
      testPackIds: ["bola-invoice-v1"],
      requestedByUserId: f.ownerId,
    });
    return { workspaceId: f.workspaceId, scanId: scan.id };
  }

  it("persists a successful explanation with provider metadata", async () => {
    const { workspaceId, scanId } = await openScan();
    const row = await recordExplanation(tdb.db, {
      workspaceId,
      scanId,
      attemptId: "22222222-2222-4222-8222-222222222222",
      requestedModel: "live-model-x",
      responseModel: "live-model-x",
      requestId: "req-live-1",
      latencyMs: 1234,
      tokensInput: 120,
      tokensOutput: 90,
      outcome: "success",
      oracleVerdict: "reproduced",
      replayVerdict: null,
      explanation: { summary: "Alice read Bob's invoice." },
      rawExplanationRedacted: { summary: "Alice read Bob's invoice." },
    });
    expect(row.oracleVerdict).toBe("reproduced");
    expect(row.provider).toBe("vultr");
    expect(row.requestedModel).toBe("live-model-x");
    const listed = await listExplanationsForAttempt(tdb.db, {
      workspaceId,
      scanId,
      attemptId: "22222222-2222-4222-8222-222222222222",
    });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.requestId).toBe("req-live-1");
  });

  it("persists a safe-failure row with no explanation but full error metadata", async () => {
    const { workspaceId, scanId } = await openScan();
    const row = await recordExplanation(tdb.db, {
      workspaceId,
      scanId,
      attemptId: "33333333-3333-4333-8333-333333333333",
      requestedModel: "live-model-x",
      latencyMs: 50,
      outcome: "timeout",
      errorCode: "timeout",
      oracleVerdict: "inconclusive",
      rawExplanationRedacted: null,
    });
    expect(row.explanation).toBeNull();
    expect(row.outcome).toBe("timeout");
    expect(row.oracleVerdict).toBe("inconclusive");
  });

  it("rejects rows for an unknown scan", async () => {
    const { workspaceId } = await openScan();
    await expect(
      recordExplanation(tdb.db, {
        workspaceId,
        scanId: "00000000-0000-4000-8000-000000000000",
        attemptId: "a",
        requestedModel: "m",
        outcome: "error",
        errorCode: "provider_error",
        oracleVerdict: "inconclusive",
        rawExplanationRedacted: null,
      }),
    ).rejects.toThrow();
  });
});
