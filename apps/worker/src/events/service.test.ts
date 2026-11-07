import { ScanIdSchema, WorkspaceIdSchema } from "@highcastle/contracts";
import { describe, expect, it } from "vitest";
import { EventValidationError } from "./errors.js";
import { EventService } from "./service.js";
import { InMemoryEventStore } from "./store-memory.js";
import type { EventStore } from "./ports.js";

const SCAN_ID = ScanIdSchema.parse("11111111-1111-4111-8111-111111111111");
const WORKSPACE_ID = WorkspaceIdSchema.parse("22222222-2222-4222-8222-222222222222");

function setup() {
  const store = new InMemoryEventStore();
  store.registerScan(SCAN_ID, WORKSPACE_ID, "project-1");
  const seen: Array<{ scanId: string; seq: number }> = [];
  const service = new EventService(store, (scanId, seq) => seen.push({ scanId, seq }));
  return { store, service, seen };
}

describe("EventService.publish", () => {
  it("persists a valid event with seq 1 and notifies after persistence", async () => {
    const { service, seen } = setup();
    const event = await service.publish({
      workspaceId: WORKSPACE_ID,
      scanId: SCAN_ID,
      eventType: "scan.started",
      phase: "preparing",
      actorType: "worker",
      safeSummary: "Preparing authorized lab assessment",
    });
    expect(event.seq).toBe(1);
    expect(event.schemaVersion).toBe(1);
    expect(seen).toEqual([{ scanId: SCAN_ID, seq: 1 }]);
  });

  it("assigns gapless sequences across concurrent publishes", async () => {
    const { service } = setup();
    const events = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        service.publish({
          workspaceId: WORKSPACE_ID,
          scanId: SCAN_ID,
          eventType: "scan.stage.updated",
          phase: "executing",
          actorType: "worker",
          safeSummary: `step ${i}`,
        }),
      ),
    );
    const seqs = events.map((event) => event.seq).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
  });

  it("rejects unknown event types without persisting or notifying", async () => {
    const { service, store, seen } = setup();
    await expect(
      service.publish({
        workspaceId: WORKSPACE_ID,
        scanId: SCAN_ID,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        eventType: "finding.hacked" as any,
        actorType: "worker",
        safeSummary: "x",
      }),
    ).rejects.toBeInstanceOf(EventValidationError);
    expect(seen).toEqual([]);
    await expect(store.list(SCAN_ID, WORKSPACE_ID)).resolves.toEqual([]);
  });

  it("rejects oversize summaries and payloads", async () => {
    const { service, seen } = setup();
    await expect(
      service.publish({
        workspaceId: WORKSPACE_ID,
        scanId: SCAN_ID,
        eventType: "scan.started",
        actorType: "worker",
        safeSummary: "x".repeat(281),
      }),
    ).rejects.toBeInstanceOf(EventValidationError);
    await expect(
      service.publish({
        workspaceId: WORKSPACE_ID,
        scanId: SCAN_ID,
        eventType: "scan.started",
        actorType: "worker",
        safeSummary: "ok",
        payloadRedacted: { blob: "x".repeat(40 * 1024) },
      }),
    ).rejects.toBeInstanceOf(EventValidationError);
    expect(seen).toEqual([]);
  });

  it("enforces specialized rules: test.executed requires attemptId", async () => {
    const { service, seen } = setup();
    await expect(
      service.publish({
        workspaceId: WORKSPACE_ID,
        scanId: SCAN_ID,
        eventType: "test.executed",
        phase: "executing",
        actorType: "runner",
        safeSummary: "no attempt reference",
        attemptId: null,
      }),
    ).rejects.toBeInstanceOf(EventValidationError);
    expect(seen).toEqual([]);
  });

  it("does not notify when the store fails", async () => {
    const seen: Array<{ scanId: string; seq: number }> = [];
    const failing: EventStore = {
      async append() {
        throw new Error("db down");
      },
      async list() {
        return [];
      },
    };
    const service = new EventService(failing, (scanId, seq) => seen.push({ scanId, seq }));
    await expect(
      service.publish({
        workspaceId: WORKSPACE_ID,
        scanId: SCAN_ID,
        eventType: "scan.started",
        actorType: "worker",
        safeSummary: "x",
      }),
    ).rejects.toThrow("db down");
    expect(seen).toEqual([]);
  });
});

describe("EventService.readHistory", () => {
  it("returns ordered history after a cursor", async () => {
    const { service } = setup();
    for (const summary of ["one", "two", "three"]) {
      await service.publish({
        workspaceId: WORKSPACE_ID,
        scanId: SCAN_ID,
        eventType: "scan.stage.updated",
        actorType: "worker",
        safeSummary: summary,
      });
    }
    const events = await service.readHistory(SCAN_ID, WORKSPACE_ID, 1);
    expect(events.map((event) => event.seq)).toEqual([2, 3]);
  });

  it("rejects invalid cursors and limits", async () => {
    const { service } = setup();
    await expect(service.readHistory(SCAN_ID, WORKSPACE_ID, "abc")).rejects.toBeInstanceOf(
      EventValidationError,
    );
    await expect(service.readHistory(SCAN_ID, WORKSPACE_ID, -1)).rejects.toBeInstanceOf(
      EventValidationError,
    );
    await expect(service.readHistory(SCAN_ID, WORKSPACE_ID, 0, 0)).rejects.toBeInstanceOf(
      EventValidationError,
    );
    await expect(service.readHistory(SCAN_ID, WORKSPACE_ID, 0, 501)).rejects.toBeInstanceOf(
      EventValidationError,
    );
  });

  it("propagates store isolation as not_found", async () => {
    const store = new InMemoryEventStore();
    const service = new EventService(store);
    const foreign = WorkspaceIdSchema.parse("33333333-3333-4333-8333-333333333333");
    store.registerScan(SCAN_ID, WORKSPACE_ID, "project-1");
    await expect(service.readHistory(SCAN_ID, foreign, 0)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(service.readHistory(SCAN_ID, WORKSPACE_ID, 0)).resolves.toHaveLength(0);
  });
});
