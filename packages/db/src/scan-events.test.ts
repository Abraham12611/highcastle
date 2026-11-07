import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createFixtureChain, createTestDb, type TestDb } from "./test-utils.js";
import {
  appendScanEvent,
  createScan,
  listScanEvents,
  requestScanCancel,
  transitionScan,
} from "./repos/scans.js";

/**
 * Durable scan events: strictly increasing `seq` per scan, transactional
 * with state transitions, and safe under concurrent writers.
 */
describe("scan events and lifecycle", () => {
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
      idempotencyKey: `scan-${f.workspaceId}`,
    });
    return { f, scan };
  }

  it("appends sequential events starting at 1", async () => {
    const { f, scan } = await openScan();
    for (const [i, type] of ["scan.requested", "scan.started", "scan.stage.updated"].entries()) {
      const event = await appendScanEvent(tdb.db, {
        workspaceId: f.workspaceId,
        scanId: scan.id,
        eventType: type as "scan.started",
        phase: "preparing",
        actorType: "worker",
        safeSummary: `event ${i + 1}`,
      });
      expect(event.seq).toBe(i + 1);
    }
    const history = await listScanEvents(tdb.db, f.workspaceId, scan.id);
    expect(history.map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  it("orders concurrent appends into a gapless unique sequence", async () => {
    const { f, scan } = await openScan();
    const N = 20;
    const events = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        appendScanEvent(tdb.db, {
          workspaceId: f.workspaceId,
          scanId: scan.id,
          eventType: "scan.stage.updated",
          phase: "executing",
          actorType: "runner",
          safeSummary: `concurrent ${i}`,
        }),
      ),
    );
    const seqs = events.map((e) => e.seq).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: N }, (_, i) => i + 1));
    const history = await listScanEvents(tdb.db, f.workspaceId, scan.id);
    expect(history.map((e) => e.seq)).toEqual(seqs);
  });

  it("paginates history after a sequence cursor (SSE rehydrate)", async () => {
    const { f, scan } = await openScan();
    for (let i = 0; i < 5; i++) {
      await appendScanEvent(tdb.db, {
        workspaceId: f.workspaceId,
        scanId: scan.id,
        eventType: "scan.stage.updated",
        phase: "planning",
        actorType: "worker",
        safeSummary: `step ${i}`,
      });
    }
    const tail = await listScanEvents(tdb.db, f.workspaceId, scan.id, {
      afterSeq: 3,
    });
    expect(tail.map((e) => e.seq)).toEqual([4, 5]);
  });

  it("rejects illegal transitions and locks terminal scans", async () => {
    const { f, scan } = await openScan();
    await expect(
      transitionScan(tdb.db, f.workspaceId, scan.id, { to: "completed" }),
    ).rejects.toMatchObject({ code: "conflict" });

    const preparing = await transitionScan(tdb.db, f.workspaceId, scan.id, {
      to: "preparing",
    });
    expect(preparing.status).toBe("preparing");
    expect(preparing.startedAt).not.toBeNull();

    await transitionScan(tdb.db, f.workspaceId, scan.id, { to: "recon" });
    await transitionScan(tdb.db, f.workspaceId, scan.id, { to: "planning" });
    await transitionScan(tdb.db, f.workspaceId, scan.id, { to: "executing" });
    await transitionScan(tdb.db, f.workspaceId, scan.id, { to: "verifying" });
    const done = await transitionScan(tdb.db, f.workspaceId, scan.id, {
      to: "completed",
    });
    expect(done.endedAt).not.toBeNull();

    await expect(
      transitionScan(tdb.db, f.workspaceId, scan.id, { to: "planning" }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(requestScanCancel(tdb.db, f.workspaceId, scan.id)).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("supports the cancel path: flag, then worker closes to canceled", async () => {
    const { f, scan } = await openScan();
    await transitionScan(tdb.db, f.workspaceId, scan.id, { to: "preparing" });
    const flagged = await requestScanCancel(tdb.db, f.workspaceId, scan.id);
    expect(flagged.cancelRequestedAt).not.toBeNull();
    const canceled = await transitionScan(tdb.db, f.workspaceId, scan.id, {
      to: "canceled",
    });
    expect(canceled.status).toBe("canceled");
    expect(canceled.endedAt).not.toBeNull();
  });

  it("idempotent creation: same key returns the same scan", async () => {
    const { f, scan } = await openScan();
    const again = await createScan(tdb.db, {
      workspaceId: f.workspaceId,
      projectId: f.projectId,
      scopeId: f.scopeId,
      targetId: f.targetId,
      environmentId: f.environmentId,
      targetRevision: "rev-changed?",
      testPackIds: ["bola-invoice-v1"],
      requestedByUserId: f.ownerId,
      idempotencyKey: `scan-${f.workspaceId}`,
    });
    expect(again.id).toBe(scan.id);
    expect(again.targetRevision).toBe(f.envRevision);
  });
});
