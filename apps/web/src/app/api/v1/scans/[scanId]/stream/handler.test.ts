import {
  AttemptIdSchema,
  ScanEventIdSchema,
  ScanIdSchema,
  WorkspaceIdSchema,
  type ScanEvent,
} from "@highcastle/contracts";
import { describe, expect, it } from "vitest";
import type {
  StreamAuthorizer,
  StreamDeps,
  StreamEventStore,
  StreamSession,
} from "./deps.js";
import { handleScanStream } from "./handler.js";

const SCAN_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const SESSION: StreamSession = { userId: "user-1" };

function makeEvent(seq: number, extra?: Partial<ScanEvent>): ScanEvent {
  return {
    id: ScanEventIdSchema.parse(
      `aaaaaaaa-aaaa-4aaa-8aaa-0000000000${String(seq).padStart(2, "0")}`,
    ),
    workspaceId: WorkspaceIdSchema.parse(WORKSPACE_ID),
    scanId: ScanIdSchema.parse(SCAN_ID),
    seq,
    schemaVersion: 1,
    eventType: "scan.stage.updated",
    phase: "executing",
    actorType: "worker",
    safeSummary: `step ${seq}`,
    payloadRedacted: {},
    attemptId: null,
    occurredAt: "2026-11-06T15:00:00Z",
    ...extra,
  };
}

interface ScriptedStore extends StreamEventStore {
  calls: () => number;
}

function scriptedStore(batches: ScanEvent[][]): ScriptedStore {
  let calls = 0;
  const store: StreamEventStore = {
    async list(
      _scanId: string,
      _workspaceId: string,
      options?: { afterSeq?: number; limit?: number },
    ): Promise<ScanEvent[]> {
      calls += 1;
      const after = options?.afterSeq ?? 0;
      const limit = options?.limit ?? 100;
      const batch = batches[Math.min(calls - 1, batches.length - 1)] ?? [];
      return batch.filter((event) => event.seq > after).slice(0, limit);
    },
  };
  return Object.assign(store, { calls: () => calls });
}

function allowAuth(scope = { workspaceId: WORKSPACE_ID, projectId: "p1" }) {
  let calls = 0;
  const authorizer: StreamAuthorizer = {
    async authorizeScanRead() {
      calls += 1;
      return scope;
    },
  };
  return { authorizer, calls: () => calls };
}

async function readUntil(
  response: Response,
  predicate: (text: string) => boolean,
  timeoutMs = 3000,
): Promise<{ text: string; done: boolean }> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("response has no body");
  const decoder = new TextDecoder();
  let text = "";
  let done = false;
  const deadline = Date.now() + timeoutMs;
  try {
    for (;;) {
      if (predicate(text)) break;
      if (Date.now() > deadline) {
        throw new Error(
          `timed out waiting for stream content; got: ${JSON.stringify(text)}`,
        );
      }
      const next = await reader.read();
      if (next.done) {
        done = true;
        break;
      }
      text += decoder.decode(next.value, { stream: true });
    }
    return { text, done };
  } finally {
    await reader.cancel();
  }
}

describe("handleScanStream auth and validation", () => {
  it("rejects malformed scan ids with 400", async () => {
    const { authorizer } = allowAuth();
    const response = await handleScanStream({
      scanIdParam: "not-a-uuid",
      lastEventId: null,
      afterParam: null,
      session: SESSION,
      deps: { store: scriptedStore([]), authorizer },
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      error: { code: string };
    };
    expect(body.error.code).toBe("validation_error");
  });

  it("requires a session (401) without touching authz or the store", async () => {
    const auth = allowAuth();
    const store = scriptedStore([]);
    const response = await handleScanStream({
      scanIdParam: SCAN_ID,
      lastEventId: null,
      afterParam: null,
      session: null,
      deps: { store, authorizer: auth.authorizer },
    });
    expect(response.status).toBe(401);
    expect(auth.calls()).toBe(0);
    expect(store.calls()).toBe(0);
  });

  it("returns 404 for denied scans without touching the store", async () => {
    const store = scriptedStore([[
      makeEvent(1, { eventType: "scan.started", phase: "preparing" }),
    ]]);
    const response = await handleScanStream({
      scanIdParam: SCAN_ID,
      lastEventId: null,
      afterParam: null,
      session: SESSION,
      deps: {
        store,
        authorizer: {
          async authorizeScanRead() {
            return null;
          },
        },
      },
    });
    expect(response.status).toBe(404);
    const body = (await response.json()) as {
      error: { code: string };
    };
    expect(body.error.code).toBe("not_found");
    expect(store.calls()).toBe(0);
  });

  it("returns 503 when authorization is unavailable", async () => {
    const response = await handleScanStream({
      scanIdParam: SCAN_ID,
      lastEventId: null,
      afterParam: null,
      session: SESSION,
      deps: {
        store: scriptedStore([]),
        authorizer: {
          async authorizeScanRead() {
            throw new Error("db down");
          },
        },
      },
    });
    expect(response.status).toBe(503);
  });

  it("rejects invalid cursors with 400", async () => {
    const { authorizer } = allowAuth();
    for (const [lastEventId, afterParam] of [
      ["abc", null],
      [null, "nope"],
      ["-2", null],
    ] as const) {
      const response = await handleScanStream({
        scanIdParam: SCAN_ID,
        lastEventId,
        afterParam,
        session: SESSION,
        deps: { store: scriptedStore([]), authorizer },
      });
      expect(response.status).toBe(400);
    }
  });
});

describe("handleScanStream SSE transport", () => {
  const history: ScanEvent[] = [
    makeEvent(1, {
      eventType: "scan.started",
      phase: "preparing",
      safeSummary: "Preparing authorized lab assessment",
    }),
    makeEvent(2, {
      eventType: "test.executed",
      attemptId: AttemptIdSchema.parse("55555555-5555-4555-8555-555555555555"),
      safeSummary: "Cross-account response recorded",
    }),
    makeEvent(3, {
      eventType: "finding.confirmed",
      phase: "verifying",
      actorType: "oracle",
      safeSummary: "Ownership bypass reproduced",
      payloadRedacted: {
        stdout: "model chain-of-thought: ...",
        sessionCookie: "sekret-token",
        findingId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      },
    }),
  ];

  function liveDeps(
    batches: ScanEvent[][],
    overrides?: Partial<StreamDeps>,
  ): { deps: StreamDeps; store: ScriptedStore } {
    const { authorizer } = allowAuth();
    const store = scriptedStore(batches);
    return {
      store,
      deps: {
        store,
        authorizer,
        pollIntervalMs: 5,
        heartbeatMs: 60_000,
        ...overrides,
      },
    };
  }

  it("streams history with exact SSE framing and safe fields only", async () => {
    const { deps } = liveDeps([history]);
    const response = await handleScanStream({
      scanIdParam: SCAN_ID,
      lastEventId: null,
      afterParam: null,
      session: SESSION,
      deps,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    const { text } = await readUntil(response, (output) =>
      output.includes("id: 3"),
    );
    const frame1 =
      `id: 1\nevent: scan.started\ndata: ${JSON.stringify({
        scanId: SCAN_ID,
        seq: 1,
        phase: "preparing",
        safeSummary: "Preparing authorized lab assessment",
        attemptId: null,
        occurredAt: "2026-11-06T15:00:00Z",
      })}\n\n`;
    expect(text).toContain(frame1);
    expect(text).toContain("event: test.executed");
    expect(text).toContain('"findingId":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"');
    expect(text).not.toContain("sekret-token");
    expect(text).not.toContain("chain-of-thought");
    expect(text).not.toContain("stdout");
    expect(text).not.toContain("sessionCookie");
  });

  it("resumes after a cursor and prefers Last-Event-ID over ?after=", async () => {
    const { deps } = liveDeps([history]);
    const resumed = await handleScanStream({
      scanIdParam: SCAN_ID,
      lastEventId: null,
      afterParam: "2",
      session: SESSION,
      deps,
    });
    const { text } = await readUntil(resumed, (output) =>
      output.includes("id: 3"),
    );
    expect(text).not.toContain("id: 1\n");
    expect(text).not.toContain("id: 2\n");
    expect(text).toContain("id: 3\n");

    const { deps: deps2 } = liveDeps([history]);
    const headerWins = await handleScanStream({
      scanIdParam: SCAN_ID,
      lastEventId: "2",
      afterParam: "0",
      session: SESSION,
      deps: deps2,
    });
    const resumed2 = await readUntil(headerWins, (output) =>
      output.includes("id: 3"),
    );
    expect(resumed2.text).not.toContain("id: 1\n");
    expect(resumed2.text).toContain("id: 3\n");
  });

  it("delivers live events appended after the stream starts", async () => {
    const first = makeEvent(1, { eventType: "scan.started" });
    const second = makeEvent(2, { safeSummary: "live step" });
    const batches: ScanEvent[][] = [[first], [first], [first, second]];
    const { deps } = liveDeps(batches);
    const response = await handleScanStream({
      scanIdParam: SCAN_ID,
      lastEventId: null,
      afterParam: null,
      session: SESSION,
      deps,
    });
    const { text } = await readUntil(response, (output) =>
      output.includes("id: 2"),
    );
    expect(text).toContain("live step");
  });

  it("stops polling after the browser disconnects", async () => {
    const { deps, store } = liveDeps([history]);
    const response = await handleScanStream({
      scanIdParam: SCAN_ID,
      lastEventId: null,
      afterParam: null,
      session: SESSION,
      deps,
    });
    const { text } = await readUntil(response, (output) =>
      output.includes("id: 1"),
    );
    expect(text).toContain("id: 1");
    const callsAtCancel = store.calls();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(store.calls()).toBeLessThanOrEqual(callsAtCancel + 1);
  });

  it("emits an error frame and ends when the store fails mid-stream", async () => {
    let calls = 0;
    const { authorizer } = allowAuth();
    const store: StreamEventStore = {
      async list(): Promise<ScanEvent[]> {
        calls += 1;
        if (calls > 1) throw new Error("db down");
        return [history[0] as ScanEvent];
      },
    };
    const response = await handleScanStream({
      scanIdParam: SCAN_ID,
      lastEventId: null,
      afterParam: null,
      session: SESSION,
      deps: { store, authorizer, pollIntervalMs: 5 },
    });
    const reader = response.body?.getReader();
    if (!reader) throw new Error("response has no body");
    const decoder = new TextDecoder();
    let text = "";
    let done = false;
    const deadline = Date.now() + 3000;
    try {
      for (;;) {
        if (Date.now() > deadline) throw new Error("timed out");
        const next = await reader.read();
        if (next.done) {
          done = true;
          break;
        }
        text += decoder.decode(next.value, { stream: true });
        if (text.includes("event: error")) break;
      }
      // Drain to end-of-stream after the error frame.
      for (;;) {
        const next = await reader.read();
        if (next.done) {
          done = true;
          break;
        }
        if (Date.now() > deadline) throw new Error("stream did not end");
      }
    } finally {
      await reader.cancel();
    }
    expect(text).toContain("event: error");
    expect(done).toBe(true);
  });

  it("sends heartbeats on idle connections", async () => {
    const { deps } = liveDeps([[]], { heartbeatMs: 10 });
    const response = await handleScanStream({
      scanIdParam: SCAN_ID,
      lastEventId: null,
      afterParam: null,
      session: SESSION,
      deps,
    });
    const { text } = await readUntil(
      response,
      (output) => output.includes(": heartbeat"),
      5000,
    );
    expect(text).toContain(": heartbeat\n\n");
  });
});
