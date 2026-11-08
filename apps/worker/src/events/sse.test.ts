import {
  AttemptIdSchema,
  ScanEventIdSchema,
  ScanIdSchema,
  WorkspaceIdSchema,
  type ScanEvent,
} from "@highcastle/contracts";
import { describe, expect, it } from "vitest";
import { EventValidationError } from "./errors.js";
import { EventHub } from "./hub.js";
import {
  encodeHeartbeat,
  encodeSseEvent,
  parseResumeCursor,
  streamScanEvents,
  toBrowserPayload,
} from "./sse.js";
import { InMemoryEventStore } from "./store-memory.js";
import type { EventStore } from "./ports.js";

const SCAN_ID = ScanIdSchema.parse("11111111-1111-4111-8111-111111111111");
const WORKSPACE_ID = WorkspaceIdSchema.parse("22222222-2222-4222-8222-222222222222");

function seedStore(events: Array<Partial<ScanEvent>>): InMemoryEventStore {
  const store = new InMemoryEventStore();
  store.registerScan(SCAN_ID, WORKSPACE_ID, "project-1");
  for (const [index, partial] of events.entries()) {
    const record = store as unknown as {
      scans: Map<string, { events: ScanEvent[] }>;
    };
    record.scans.get(SCAN_ID)?.events.push({
      id: ScanEventIdSchema.parse(
        `00000000-0000-4000-8000-0000000000${String(index + 1).padStart(2, "0")}`,
      ),
      workspaceId: WORKSPACE_ID,
      scanId: SCAN_ID,
      seq: index + 1,
      schemaVersion: 1,
      eventType: "scan.stage.updated",
      phase: "executing",
      actorType: "worker",
      safeSummary: `step ${index + 1}`,
      payloadRedacted: {},
      attemptId: null,
      occurredAt: "2026-11-06T15:00:00Z",
      ...partial,
    } as ScanEvent);
  }
  return store;
}

async function collect(
  generator: AsyncGenerator<string, void, void>,
  maxChunks: number,
  stopAfter?: (text: string) => boolean,
): Promise<string> {
  let text = "";
  let chunks = 0;
  for await (const chunk of generator) {
    text += chunk;
    chunks += 1;
    if ((stopAfter && stopAfter(text)) || chunks >= maxChunks) break;
  }
  return text;
}

describe("SSE framing", () => {
  it("encodes id/event/data frames byte-exactly", () => {
    expect(encodeSseEvent(4, "scan.stage.updated", '{"seq":4}')).toBe(
      'id: 4\nevent: scan.stage.updated\ndata: {"seq":4}\n\n',
    );
    expect(encodeHeartbeat()).toBe(": heartbeat\n\n");
  });
});

describe("parseResumeCursor", () => {
  it("prefers Last-Event-ID over ?after=", () => {
    expect(parseResumeCursor({ lastEventId: "7", after: "3" })).toBe(7);
  });

  it("falls back to ?after= and defaults to 0", () => {
    expect(parseResumeCursor({ lastEventId: null, after: "4" })).toBe(4);
    expect(parseResumeCursor({ lastEventId: null, after: undefined })).toBe(0);
  });

  it("rejects invalid, negative, and fractional cursors", () => {
    for (const bad of ["abc", "-1", "1.5", "NaN"]) {
      expect(() => parseResumeCursor({ lastEventId: bad, after: 0 })).toThrow(EventValidationError);
    }
    expect(() => parseResumeCursor({ lastEventId: null, after: "nope" })).toThrow(
      EventValidationError,
    );
  });
});

describe("toBrowserPayload", () => {
  it("carries only allowlisted fields, never stored payloads", () => {
    const { name, payload } = toBrowserPayload({
      id: ScanEventIdSchema.parse("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
      workspaceId: WORKSPACE_ID,
      scanId: SCAN_ID,
      seq: 2,
      schemaVersion: 1,
      eventType: "test.executed",
      phase: "executing",
      actorType: "runner",
      safeSummary: "Cross-account response recorded",
      payloadRedacted: {
        requestBody: "session=sekret-token",
        stdout: "model chain-of-thought: ...",
        findingId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      },
      attemptId: AttemptIdSchema.parse("55555555-5555-4555-8555-555555555555"),
      occurredAt: "2026-11-06T15:00:00Z",
    });
    expect(name).toBe("test.executed");
    const json = JSON.stringify(payload);
    expect(json).not.toContain("sekret-token");
    expect(json).not.toContain("chain-of-thought");
    expect(json).not.toContain("requestBody");
    expect(payload.findingId).toBe("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee");
  });

  it("drops malformed findingIds instead of leaking them", () => {
    const { payload } = toBrowserPayload({
      id: ScanEventIdSchema.parse("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
      workspaceId: WORKSPACE_ID,
      scanId: SCAN_ID,
      seq: 2,
      schemaVersion: 1,
      eventType: "finding.confirmed",
      phase: "verifying",
      actorType: "oracle",
      safeSummary: "confirmed",
      payloadRedacted: { findingId: "not-a-uuid" },
      attemptId: null,
      occurredAt: "2026-11-06T15:00:00Z",
    });
    expect(payload.findingId).toBeUndefined();
  });
});

describe("streamScanEvents", () => {
  it("replays history in order and resumes after a cursor", async () => {
    const store = seedStore([{}, {}, {}]);
    const all = await collect(
      streamScanEvents({
        store,
        scanId: SCAN_ID,
        workspaceId: WORKSPACE_ID,
        after: 0,
        pollIntervalMs: 5,
      }),
      10,
      (text) => text.includes("id: 3"),
    );
    expect(all).toContain("id: 1\nevent: scan.stage.updated");
    expect(all).toContain("id: 2\nevent: scan.stage.updated");
    expect(all).toContain("id: 3\nevent: scan.stage.updated");

    const resumed = await collect(
      streamScanEvents({
        store,
        scanId: SCAN_ID,
        workspaceId: WORKSPACE_ID,
        after: 2,
        pollIntervalMs: 5,
      }),
      10,
      (text) => text.includes("id: 3"),
    );
    expect(resumed).not.toContain("id: 1\n");
    expect(resumed).not.toContain("id: 2\n");
    expect(resumed).toContain("id: 3\n");
  });

  it("delivers live events and recovers gaps on the next poll", async () => {
    const batches: ScanEvent[][] = [[makeEvent(1)], [], [makeEvent(2), makeEvent(3)]];
    let calls = 0;
    const store: EventStore = {
      async append(): Promise<ScanEvent> {
        throw new Error("not implemented");
      },
      async list(): Promise<ScanEvent[]> {
        const batch = batches[Math.min(calls, batches.length - 1)] ?? [];
        calls += 1;
        return batch;
      },
    };
    const text = await collect(
      streamScanEvents({
        store,
        scanId: SCAN_ID,
        workspaceId: WORKSPACE_ID,
        after: 0,
        pollIntervalMs: 5,
      }),
      10,
      (output) => output.includes("id: 3"),
    );
    expect(text).toContain("id: 1\n");
    expect(text).toContain("id: 2\n");
    expect(text).toContain("id: 3\n");
  });

  it("dedupes overlapping batches by seq", async () => {
    let calls = 0;
    const store: EventStore = {
      async append(): Promise<ScanEvent> {
        throw new Error("not implemented");
      },
      async list(): Promise<ScanEvent[]> {
        calls += 1;
        return calls === 1 ? [makeEvent(1), makeEvent(2)] : [makeEvent(2), makeEvent(3)];
      },
    };
    const text = await collect(
      streamScanEvents({
        store,
        scanId: SCAN_ID,
        workspaceId: WORKSPACE_ID,
        after: 0,
        pollIntervalMs: 5,
      }),
      10,
      (output) => output.includes("id: 3"),
    );
    expect(text.match(/id: 2\n/g)).toHaveLength(1);
  });

  it("ends on abort and releases hub waiters", async () => {
    const hub = new EventHub();
    const store = seedStore([]);
    const controller = new AbortController();
    const generator = streamScanEvents({
      store,
      hub,
      scanId: SCAN_ID,
      workspaceId: WORKSPACE_ID,
      after: 0,
      pollIntervalMs: 1000,
      signal: controller.signal,
    });
    const consumed: string[] = [];
    const pending = (async () => {
      for await (const chunk of generator) {
        consumed.push(chunk);
      }
    })();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(hub.pendingCount(SCAN_ID)).toBe(1);
    controller.abort();
    await pending;
    expect(consumed).toEqual([]);
    expect(hub.pendingCount()).toBe(0);
  });

  it("emits heartbeats on idle connections", async () => {
    const store = seedStore([]);
    const text = await collect(
      streamScanEvents({
        store,
        scanId: SCAN_ID,
        workspaceId: WORKSPACE_ID,
        after: 0,
        pollIntervalMs: 5,
        heartbeatMs: 10,
      }),
      10,
      (output) => output.includes(": heartbeat"),
    );
    expect(text).toContain(": heartbeat\n\n");
  }, 5000);
});

function makeEvent(seq: number): ScanEvent {
  return {
    id: ScanEventIdSchema.parse(
      `00000000-0000-4000-8000-0000000000${String(seq).padStart(2, "0")}`,
    ),
    workspaceId: WORKSPACE_ID,
    scanId: SCAN_ID,
    seq,
    schemaVersion: 1,
    eventType: "scan.stage.updated",
    phase: "executing",
    actorType: "worker",
    safeSummary: `step ${seq}`,
    payloadRedacted: {},
    attemptId: null,
    occurredAt: "2026-11-06T15:00:00Z",
  };
}
