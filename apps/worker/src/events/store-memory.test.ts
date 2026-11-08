import { ScanIdSchema, WorkspaceIdSchema } from "@highcastle/contracts";
import { describe, expect, it } from "vitest";
import { InMemoryEventStore } from "./store-memory.js";

const SCAN_ID = ScanIdSchema.parse("11111111-1111-4111-8111-111111111111");
const WORKSPACE_ID = WorkspaceIdSchema.parse("22222222-2222-4222-8222-222222222222");
const FOREIGN_WORKSPACE_ID = WorkspaceIdSchema.parse("33333333-3333-4333-8333-333333333333");

function registered(): InMemoryEventStore {
  const store = new InMemoryEventStore();
  store.registerScan(SCAN_ID, WORKSPACE_ID, "project-1");
  return store;
}

describe("InMemoryEventStore", () => {
  it("requires registration before append or list", async () => {
    const store = new InMemoryEventStore();
    await expect(
      store.append({
        workspaceId: WORKSPACE_ID,
        scanId: SCAN_ID,
        eventType: "scan.started",
        actorType: "worker",
        safeSummary: "x",
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(store.list(SCAN_ID, WORKSPACE_ID)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("isolates tenants: foreign workspace reads as missing", async () => {
    const store = registered();
    await store.append({
      workspaceId: WORKSPACE_ID,
      scanId: SCAN_ID,
      eventType: "scan.started",
      actorType: "worker",
      safeSummary: "hello",
    });
    await expect(
      store.append({
        workspaceId: FOREIGN_WORKSPACE_ID,
        scanId: SCAN_ID,
        eventType: "scan.started",
        actorType: "worker",
        safeSummary: "intruder",
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(store.list(SCAN_ID, FOREIGN_WORKSPACE_ID)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(store.list(SCAN_ID, WORKSPACE_ID)).resolves.toHaveLength(1);
  });

  it("keeps gapless sequences under concurrent appends", async () => {
    const store = registered();
    const events = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        store.append({
          workspaceId: WORKSPACE_ID,
          scanId: SCAN_ID,
          eventType: "scan.stage.updated",
          actorType: "worker",
          safeSummary: `step ${i}`,
        }),
      ),
    );
    expect(new Set(events.map((event) => event.seq)).size).toBe(50);
    const listed = await store.list(SCAN_ID, WORKSPACE_ID, { limit: 100 });
    expect(listed.map((event) => event.seq)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
  });

  it("honors afterSeq and limit", async () => {
    const store = registered();
    for (let i = 0; i < 5; i++) {
      await store.append({
        workspaceId: WORKSPACE_ID,
        scanId: SCAN_ID,
        eventType: "scan.stage.updated",
        actorType: "worker",
        safeSummary: `step ${i}`,
      });
    }
    const page = await store.list(SCAN_ID, WORKSPACE_ID, {
      afterSeq: 2,
      limit: 2,
    });
    expect(page.map((event) => event.seq)).toEqual([3, 4]);
  });
});
