import type { ScanEventType } from "@highcastle/contracts";
import {
  isTerminalEvent,
  parseFrame,
  type ScanEventFrame,
} from "./types";

/**
 * Injectable SSE engine for `/api/v1/scans/:scanId/stream`.
 *
 * L17 semantics (verified against handler.ts): `id:` carries the seq,
 * `event:` the eventType, `data:` the browser-safe frame. Resume = send
 * `Last-Event-ID` (native EventSource does this automatically) or `?after=`.
 *
 * Dedup/order: seq is authoritative — repeated events are dropped once,
 * out-of-order events are still delivered (the store sorts for display).
 * Reconnect: native EventSource auto-reconnects transient drops; on hard
 * close (readyState CLOSED — e.g. 401/404) we stop and surface `failed`.
 * Terminal scan events close the stream deliberately.
 */

export type StreamStatus =
  | "connecting"
  | "live"
  | "reconnecting"
  | "closed"
  | "failed";

export interface EventSourceLike {
  readonly readyState: number;
  close(): void;
  addEventListener(
    type: string,
    listener: (ev: { data: string; lastEventId: string | null }) => void,
  ): void;
  onerror: (() => void) | null;
}

export interface ScanStreamOptions {
  url: string;
  /** Initial cursor; appended as `?after=` so reloads resume history. */
  afterSeq?: number;
  eventSourceFactory?: (url: string) => EventSourceLike;
  onFrame: (frame: ScanEventFrame) => void;
  onStatus?: (status: StreamStatus) => void;
  /** Fired once when a terminal scan event arrives. */
  onTerminal?: (frame: ScanEventFrame) => void;
  /** Fired when the stream is unrecoverable (hard-closed / exhausted). */
  onFailed?: (reason: string) => void;
}

export interface ScanStreamHandle {
  close: () => void;
  readonly lastSeenSeq: number;
  readonly status: StreamStatus;
}

const KNOWN_EVENTS: ScanEventType[] = [
  "workspace.created",
  "project.created",
  "source.connected",
  "target.verified",
  "scope.approved",
  "scan.requested",
  "scan.started",
  "scan.stage.updated",
  "scan.cancel_requested",
  "scan.canceled",
  "test.approval_required",
  "test.plan.validated",
  "test.executed",
  "sandbox.action_blocked",
  "finding.confirmed",
  "scan.completed",
  "scan.failed",
  "remediation.created",
  "replay.completed",
  "finding.verified_fixed",
  "github.pr.updated",
  "schedule.due",
  "integration.revoked",
  "workspace.emergency_stopped",
];

export function connectScanStream(
  opts: ScanStreamOptions,
): ScanStreamHandle {
  const seen = new Set<number>();
  let closed = false;
  let status: StreamStatus = "connecting";
  const setStatus = (s: StreamStatus) => {
    status = s;
    opts.onStatus?.(s);
  };

  const url =
    opts.afterSeq !== undefined && opts.afterSeq > 0
      ? `${opts.url}${opts.url.includes("?") ? "&" : "?"}after=${opts.afterSeq}`
      : opts.url;

  const factory =
    opts.eventSourceFactory ??
    ((u: string) => new EventSource(u) as unknown as EventSourceLike);
  const source = factory(url);

  const dispatch = (eventType: string, data: string) => {
    if (closed) return;
    const frame = parseFrame(eventType, data);
    if (frame === null) return; // malformed frame: never fabricate
    if (seen.has(frame.seq)) return; // dedupe — seq is idempotent key
    seen.add(frame.seq);
    opts.onFrame(frame);
    if (isTerminalEvent(frame.eventType)) {
      setStatus("closed");
      opts.onTerminal?.(frame);
      source.close();
      closed = true;
    }
  };

  for (const t of KNOWN_EVENTS) {
    source.addEventListener(t, (ev) => dispatch(t, ev.data));
  }
  // Generic message handler — L17 always sends named events, but keep a
  // defensive path so nothing arrives unseen.
  source.addEventListener("message", (ev) =>
    dispatch("scan.stage.updated", ev.data),
  );

  source.onerror = () => {
    if (closed) return;
    // readyState 0 (CONNECTING): browser is auto-reconnecting with
    // Last-Event-ID — fine. readyState 2 (CLOSED): unrecoverable.
    if (source.readyState === 2) {
      setStatus("failed");
      opts.onFailed?.("event stream closed by server");
      closed = true;
      source.close();
    } else {
      setStatus("reconnecting");
    }
  };

  setStatus("connecting");
  // Native EventSource fires `open` on connect; emulate detection via first
  // frame or error. Consumers may also call markLive() externally.
  source.addEventListener("open", () => {
    if (!closed) setStatus("live");
  });

  return {
    close: () => {
      if (closed) return;
      closed = true;
      source.close();
      setStatus("closed");
    },
    get lastSeenSeq() {
      return seen.size === 0 ? 0 : Math.max(...seen);
    },
    get status() {
      return status;
    },
  };
}
