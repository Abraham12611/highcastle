import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createFixtureChain, createTestDb, type TestDb } from "./test-utils.js";
import { createScan } from "./repos/scans.js";
import {
  createAttempt,
  createEvidenceArtifact,
  recordAttemptVerdict,
} from "./repos/attempts.js";
import {
  listExplanationsForAttempt,
  recordExplanation,
} from "./repos/explanations.js";

/**
 * Post-execution explanation persistence (Engineer 8, issue #55).
 *
 * - Success and safe-failure rows both persist with full provider metadata.
 * - The recorded oracle verdict is the caller's persisted verdict; the
 *   table has no path for a model-claimed verdict.
 * - Rows are scoped to (workspace, scan, attempt).
 * - Hardening (coordinator review): the store verifies the referenced
 *   attempt row AND every cited evidence artifact belong to the exact
 *   scan/workspace/attempt — caller-provided IDs are never trusted.
 * - The stored verdict must equal the attempt's persisted oracle verdict;
 *   an explanation may never change the oracle result.
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

  async function openAttemptWithEvidence(input?: {
    verdict?: "reproduced" | "not_reproduced" | "inconclusive";
  }) {
    const { workspaceId, scanId } = await openScan();
    const attempt = await createAttempt(tdb.db, {
      workspaceId,
      scanId,
      packId: "bola-invoice-v1",
      packVersion: "1.0.0",
      planHash: "plan-explanation-test",
      scopeHash: "scope-explanation-test",
      targetRevision: "lab-v1-vulnerable",
    });
    const verdict = input?.verdict ?? "reproduced";
    await recordAttemptVerdict(tdb.db, workspaceId, attempt.id, {
      oracleVersion: "bola-oracle-v1",
      verdict,
    });
    const evidenceIds: string[] = [];
    for (const suffix of ["aa", "bb"]) {
      const artifact = await createEvidenceArtifact(tdb.db, {
        workspaceId,
        scanId,
        attemptId: attempt.id,
        artifactKind: "redacted_response",
        storageKind: "db",
        storageKey: `unguessable-storage-key-${suffix}-${attempt.id.slice(0, 8)}`,
        sha256: suffix.repeat(32),
        byteSize: 128,
        contentType: "application/json",
      });
      evidenceIds.push(artifact.id);
    }
    return { workspaceId, scanId, attemptId: attempt.id, evidenceIds, verdict };
  }

  it("persists a successful explanation with verified attempt/evidence linkage", async () => {
    const { workspaceId, scanId, attemptId, evidenceIds } =
      await openAttemptWithEvidence();
    const row = await recordExplanation(tdb.db, {
      workspaceId,
      scanId,
      attemptId,
      evidenceIds,
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
      attemptId,
    });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.requestId).toBe("req-live-1");
  });

  it("persists a safe-failure row with no explanation but full error metadata", async () => {
    const { workspaceId, scanId, attemptId, evidenceIds } =
      await openAttemptWithEvidence({ verdict: "inconclusive" });
    const row = await recordExplanation(tdb.db, {
      workspaceId,
      scanId,
      attemptId,
      evidenceIds,
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

  it("rejects an attempt ID with no row in this scan/workspace", async () => {
    const { workspaceId, scanId } = await openScan();
    await expect(
      recordExplanation(tdb.db, {
        workspaceId,
        scanId,
        attemptId: "22222222-2222-4222-8222-222222222222",
        evidenceIds: [],
        requestedModel: "m",
        outcome: "error",
        errorCode: "provider_error",
        oracleVerdict: "inconclusive",
        rawExplanationRedacted: null,
      }),
    ).rejects.toThrow();
  });

  it("rejects an attempt that belongs to a different scan", async () => {
    const first = await openScan();
    const second = await openAttemptWithEvidence();
    await expect(
      recordExplanation(tdb.db, {
        workspaceId: first.workspaceId,
        scanId: first.scanId,
        attemptId: second.attemptId,
        evidenceIds: [],
        requestedModel: "m",
        outcome: "error",
        errorCode: "provider_error",
        oracleVerdict: "inconclusive",
        rawExplanationRedacted: null,
      }),
    ).rejects.toThrow();
  });

  it("rejects an unknown evidence ID", async () => {
    const { workspaceId, scanId, attemptId, evidenceIds } =
      await openAttemptWithEvidence();
    await expect(
      recordExplanation(tdb.db, {
        workspaceId,
        scanId,
        attemptId,
        evidenceIds: [...evidenceIds, "99999999-9999-4999-8999-999999999999"],
        requestedModel: "m",
        outcome: "success",
        oracleVerdict: "reproduced",
        explanation: { summary: "x" },
        rawExplanationRedacted: { summary: "x" },
      }),
    ).rejects.toThrow();
  });

  it("rejects evidence that belongs to a different scan/attempt", async () => {
    const first = await openAttemptWithEvidence();
    const { workspaceId, scanId, attemptId } = await openAttemptWithEvidence();
    // Real evidence rows, but recorded under another scan and attempt.
    await expect(
      recordExplanation(tdb.db, {
        workspaceId,
        scanId,
        attemptId,
        evidenceIds: first.evidenceIds,
        requestedModel: "m",
        outcome: "success",
        oracleVerdict: "reproduced",
        explanation: { summary: "x" },
        rawExplanationRedacted: { summary: "x" },
      }),
    ).rejects.toThrow();
  });

  it("rejects a stored verdict that differs from the persisted oracle verdict", async () => {
    const { workspaceId, scanId, attemptId, evidenceIds } =
      await openAttemptWithEvidence({ verdict: "reproduced" });
    await expect(
      recordExplanation(tdb.db, {
        workspaceId,
        scanId,
        attemptId,
        evidenceIds,
        requestedModel: "m",
        outcome: "success",
        oracleVerdict: "not_reproduced",
        explanation: { summary: "x" },
        rawExplanationRedacted: { summary: "x" },
      }),
    ).rejects.toThrow();
  });

  it("rejects rows for an unknown scan", async () => {
    const { workspaceId } = await openScan();
    await expect(
      recordExplanation(tdb.db, {
        workspaceId,
        scanId: "00000000-0000-4000-8000-000000000000",
        attemptId: "22222222-2222-4222-8222-222222222222",
        evidenceIds: [],
        requestedModel: "m",
        outcome: "error",
        errorCode: "provider_error",
        oracleVerdict: "inconclusive",
        rawExplanationRedacted: null,
      }),
    ).rejects.toThrow();
  });
});
