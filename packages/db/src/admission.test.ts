import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { count, eq } from "drizzle-orm";
import { createFixtureChain, createTestDb, type FixtureChain, type TestDb } from "./test-utils.js";
import {
  createScan,
  scanAdmissionSnapshot,
  transitionScan,
  type CreateScanInput,
  type ScanAdmission,
} from "./repos/scans.js";
import { DbError } from "./errors.js";
import { scanAdmissions, scans } from "./schema/tables.js";

/**
 * Scan admission control (issue #83).
 *
 * The ceilings live INSIDE the createScan transaction behind a per-workspace
 * advisory lock — these tests prove the cap holds under parallel submission,
 * that rejected requests leave no rows or ledger entries behind, and that
 * idempotent retries never consume budget.
 */

function scanInput(
  fixture: FixtureChain,
  overrides: Partial<CreateScanInput> = {},
): CreateScanInput {
  return {
    workspaceId: fixture.workspaceId,
    projectId: fixture.projectId,
    scopeId: fixture.scopeId,
    targetId: fixture.targetId,
    environmentId: fixture.environmentId,
    targetRevision: fixture.envRevision,
    testPackIds: ["bola-invoice-v1"],
    requestedByUserId: fixture.ownerId,
    ...overrides,
  };
}

async function countScans(tdb: TestDb, workspaceId: string): Promise<number> {
  const [row] = await tdb.db
    .select({ count: count() })
    .from(scans)
    .where(eq(scans.workspaceId, workspaceId));
  return row?.count ?? 0;
}

async function countAdmissions(tdb: TestDb, workspaceId: string): Promise<number> {
  const [row] = await tdb.db
    .select({ count: count() })
    .from(scanAdmissions)
    .where(eq(scanAdmissions.workspaceId, workspaceId));
  return row?.count ?? 0;
}

describe("scan admission ceilings", () => {
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

  it("rejects the scan beyond the per-project active ceiling with quota_exceeded", async () => {
    const f = await createFixtureChain(tdb.db);
    for (let i = 0; i < 5; i += 1) {
      await createScan(tdb.db, scanInput(f));
    }
    await expect(createScan(tdb.db, scanInput(f))).rejects.toMatchObject({
      code: "quota_exceeded",
      details: { scope: "project", active: 5, limit: 5 },
    });
    // Fail-closed: the rejection created nothing.
    expect(await countScans(tdb, f.workspaceId)).toBe(5);
  });

  it("applies default ceilings to every caller, including queue-less paths", async () => {
    const f = await createFixtureChain(tdb.db);
    // No `admission` field at all — the worker replay-scan path calls
    // createScan the same way and must still hit the workspace ceiling.
    const admission: ScanAdmission = {
      limits: { maxActivePerProject: 50, maxActivePerWorkspace: 3, maxActivePerTarget: 50 },
    };
    for (let i = 0; i < 3; i += 1) {
      await createScan(tdb.db, scanInput(f, { admission }));
    }
    await expect(createScan(tdb.db, scanInput(f, { admission }))).rejects.toMatchObject({
      code: "quota_exceeded",
      details: { scope: "workspace", active: 3, limit: 3 },
    });
  });

  it("enforces the per-target concurrency ceiling", async () => {
    const f = await createFixtureChain(tdb.db);
    const admission: ScanAdmission = {
      limits: { maxActivePerProject: 50, maxActivePerWorkspace: 50, maxActivePerTarget: 2 },
    };
    await createScan(tdb.db, scanInput(f, { admission }));
    await createScan(tdb.db, scanInput(f, { admission }));
    await expect(createScan(tdb.db, scanInput(f, { admission }))).rejects.toMatchObject({
      code: "quota_exceeded",
      details: { scope: "target", active: 2, limit: 2 },
    });
  });

  it("frees the slot when a scan reaches a terminal state (cancel preserves budget)", async () => {
    const f = await createFixtureChain(tdb.db);
    const scans_ = [];
    for (let i = 0; i < 5; i += 1) {
      scans_.push(await createScan(tdb.db, scanInput(f)));
    }
    await expect(createScan(tdb.db, scanInput(f))).rejects.toMatchObject({
      code: "quota_exceeded",
    });
    await transitionScan(tdb.db, f.workspaceId, scans_[0]!.id, { to: "canceled" });
    const admitted = await createScan(tdb.db, scanInput(f));
    expect(admitted.id).not.toBe(scans_[0]!.id);
    expect(await countScans(tdb, f.workspaceId)).toBe(6);
  });

  it("enforces per-subject rate windows against the durable ledger", async () => {
    const f = await createFixtureChain(tdb.db);
    const admission = (subject: string): ScanAdmission => ({
      limits: { maxActivePerProject: 50, maxActivePerWorkspace: 50, maxActivePerTarget: 50 },
      subject: { key: subject, windows: [{ maxPerWindow: 2, windowSeconds: 3600 }] },
    });
    await createScan(tdb.db, scanInput(f, { admission: admission("demo:g1") }));
    await createScan(tdb.db, scanInput(f, { admission: admission("demo:g1") }));
    await expect(
      createScan(tdb.db, scanInput(f, { admission: admission("demo:g1") })),
    ).rejects.toMatchObject({ code: "rate_limited" });
    // A different subject is unaffected.
    await createScan(tdb.db, scanInput(f, { admission: admission("demo:g2") }));
    expect(await countAdmissions(tdb, f.workspaceId)).toBe(3);
    // The rejected attempt wrote no ledger row for g1.
    const g1 = await tdb.db
      .select({ count: count() })
      .from(scanAdmissions)
      .where(eq(scanAdmissions.subject, "demo:g1"));
    expect(g1[0]?.count).toBe(2);
  });

  it("returns the original scan on idempotent retry without consuming budget", async () => {
    const f = await createFixtureChain(tdb.db);
    const admission: ScanAdmission = {
      limits: { maxActivePerProject: 1, maxActivePerWorkspace: 50, maxActivePerTarget: 50 },
      subject: { key: "demo:g1", windows: [{ maxPerWindow: 1, windowSeconds: 3600 }] },
    };
    const first = await createScan(tdb.db, scanInput(f, { idempotencyKey: "key-1", admission }));
    // Every ceiling is now exhausted for a NEW scan — but the replayed key
    // must still return the original row (retry is not a new admission).
    const retry = await createScan(tdb.db, scanInput(f, { idempotencyKey: "key-1", admission }));
    expect(retry.id).toBe(first.id);
    expect(await countScans(tdb, f.workspaceId)).toBe(1);
    expect(await countAdmissions(tdb, f.workspaceId)).toBe(1);
  });

  it("serializes concurrent submissions: the cap cannot be raced", async () => {
    const f = await createFixtureChain(tdb.db);
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        createScan(tdb.db, scanInput(f, { idempotencyKey: `race-${i}` })),
      ),
    );
    const admitted = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter(
      (r) => r.status === "rejected" && (r.reason as DbError).code === "quota_exceeded",
    );
    expect(admitted).toHaveLength(5);
    expect(rejected).toHaveLength(5);
    expect(await countScans(tdb, f.workspaceId)).toBe(5);
  });

  it("reports live admission pressure for monitoring surfaces", async () => {
    const f = await createFixtureChain(tdb.db);
    const created = await createScan(tdb.db, scanInput(f));
    const snapshot = await scanAdmissionSnapshot(tdb.db, f.workspaceId);
    expect(snapshot.workspaceActive).toBe(1);
    expect(snapshot.perProject[f.projectId]).toBe(1);
    expect(snapshot.perTarget[f.targetId]).toBe(1);
    await transitionScan(tdb.db, f.workspaceId, created.id, { to: "canceled" });
    const drained = await scanAdmissionSnapshot(tdb.db, f.workspaceId);
    expect(drained.workspaceActive).toBe(0);
    expect(drained.perProject[f.projectId]).toBeUndefined();
  });

  it("returns the same scan to concurrent same-key submissions", async () => {
    const f = await createFixtureChain(tdb.db);
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        createScan(tdb.db, scanInput(f, { idempotencyKey: "same-key" })),
      ),
    );
    const ids = new Set(results.map((scan) => scan.id));
    expect(ids.size).toBe(1);
    expect(await countScans(tdb, f.workspaceId)).toBe(1);
  });
});
