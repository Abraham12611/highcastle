import { describe, expect, it, vi } from "vitest";
import { connectScanStream, type EventSourceLike } from "./sse-client";
import type { ScanEventFrame } from "./types";

type Listener = (ev: { data: string; lastEventId: string | null }) => void;

function makeFakeSource(readyState = 1) {
  const listeners = new Map<string, Listener[]>();
  const src: EventSourceLike & { emit: (t: string, d: unknown) => void } = {
    readyState,
    close: vi.fn(),
    onerror: null,
    addEventListener(t: string, l: Listener) {
      listeners.set(t, [...(listeners.get(t) ?? []), l]);
    },
    emit(t: string, d: unknown) {
      for (const l of listeners.get(t) ?? []) {
        l({ data: typeof d === "string" ? d : JSON.stringify(d), lastEventId: null });
      }
    },
  };
  return src;
}

function frame(seq: number, eventType = "scan.stage.updated"): ScanEventFrame {
  return {
    eventType: eventType as ScanEventFrame["eventType"],
    scanId: "11111111-1111-4111-8111-111111111111",
    seq,
    phase: "executing",
    safeSummary: `event ${seq}`,
    attemptId: null,
    occurredAt: "2026-11-06T12:00:00Z",
  };
}

function collect(src: EventSourceLike & { emit: (t: string, d: unknown) => void }) {
  const frames: ScanEventFrame[] = [];
  const statuses: string[] = [];
  const terminals: ScanEventFrame[] = [];
  const failed: string[] = [];
  const handle = connectScanStream({
    url: "/api/v1/scans/x/stream",
    eventSourceFactory: () => src,
    onFrame: (f) => frames.push(f),
    onStatus: (s) => statuses.push(s),
    onTerminal: (f) => terminals.push(f),
    onFailed: (r) => failed.push(r),
  });
  return { frames, statuses, terminals, failed, handle };
}

describe("connectScanStream", () => {
  it("delivers frames in arrival order and dedupes repeats by seq", () => {
    const src = makeFakeSource();
    const c = collect(src);
    src.emit("scan.stage.updated", frame(1));
    src.emit("scan.stage.updated", frame(2));
    src.emit("scan.stage.updated", frame(2)); // duplicate replay
    src.emit("scan.stage.updated", frame(1)); // out-of-order replay
    expect(c.frames.map((f) => f.seq)).toEqual([1, 2]);
    expect(c.handle.lastSeenSeq).toBe(2);
    c.handle.close();
  });

  it("appends ?after= cursor for resume", () => {
    const src = makeFakeSource();
    const seenUrls: string[] = [];
    connectScanStream({
      url: "/s",
      afterSeq: 41,
      eventSourceFactory: (u) => {
        seenUrls.push(u);
        return src;
      },
      onFrame: () => {},
    }).close();
    expect(seenUrls[0]).toBe("/s?after=41");
  });

  it("drops malformed frames instead of fabricating events", () => {
    const src = makeFakeSource();
    const c = collect(src);
    src.emit("scan.stage.updated", "not-json");
    src.emit("scan.stage.updated", { seq: "nope" });
    src.emit("totally.invented", frame(9));
    expect(c.frames).toHaveLength(0);
    c.handle.close();
  });

  it("closes the stream on a terminal event and reports terminal", () => {
    const src = makeFakeSource();
    const c = collect(src);
    src.emit("test.executed", { ...frame(5), eventType: "test.executed", attemptId: "a" });
    src.emit("scan.completed", { ...frame(6), eventType: "scan.completed", phase: "finalizing" });
    src.emit("scan.stage.updated", frame(7)); // after close — ignored
    expect(c.terminals).toHaveLength(1);
    expect(c.frames.map((f) => f.seq)).toEqual([5, 6]);
    expect(src.close).toHaveBeenCalled();
    expect(c.handle.status).toBe("closed");
  });

  it("marks reconnecting on transient error, failed on hard close", () => {
    const src = makeFakeSource(0); // CONNECTING → transient
    const c = collect(src);
    src.onerror?.();
    expect(c.statuses).toContain("reconnecting");
    (src as { readyState: number }).readyState = 2; // CLOSED
    src.onerror?.();
    expect(c.failed).toEqual(["event stream closed by server"]);
    expect(c.handle.status).toBe("failed");
  });
});
