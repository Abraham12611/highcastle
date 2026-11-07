import {
  FindingIdSchema,
  ScanEventCursorSchema,
  type ScanEvent,
  type ScanId,
  type WorkspaceId,
} from "@highcastle/contracts";
import { EventValidationError } from "./errors.js";
import type { EventHub } from "./hub.js";
import type { EventStore } from "./ports.js";

/**
 * Framework-agnostic SSE core: byte framing, resume cursors, and the
 * replay-then-poll streaming loop. The Next.js route is a thin adapter over
 * this module so the same logic (and tests) cover every consumer.
 */

export const SSE_CONTENT_TYPE = "text/event-stream";
export const HEARTBEAT_COMMENT = ": heartbeat";
export const POLL_INTERVAL_MS_DEFAULT = 500;
export const HEARTBEAT_MS_DEFAULT = 15_000;

/** `id: <seq>\nevent: <name>\ndata: <json>\n\n` per the SSE wire format. */
export function encodeSseEvent(
  id: number,
  name: string,
  dataJson: string,
): string {
  return `id: ${id}\nevent: ${name}\ndata: ${dataJson}\n\n`;
}

export function encodeHeartbeat(): string {
  return `${HEARTBEAT_COMMENT}\n\n`;
}

export interface BrowserPayload {
  scanId: string;
  seq: number;
  phase: ScanEvent["phase"];
  safeSummary: string;
  attemptId: string | null;
  occurredAt: string;
  findingId?: string;
}

/**
 * Project a persisted event to its browser-safe shape. `payloadRedacted` is
 * redacted server-side by contract, but the wire carries an allowlist only:
 * scalar observation fields plus `findingId` for deep-links. Everything else
 * (request/response bodies, stdout, oracle internals) stays server-side.
 */
export function toBrowserPayload(event: ScanEvent): {
  name: string;
  payload: BrowserPayload;
} {
  const payload: BrowserPayload = {
    scanId: event.scanId,
    seq: event.seq,
    phase: event.phase,
    safeSummary: event.safeSummary,
    attemptId: event.attemptId ?? null,
    occurredAt: event.occurredAt,
  };
  const findingId = extractFindingId(event.payloadRedacted);
  if (findingId !== null) payload.findingId = findingId;
  return { name: event.eventType, payload };
}

function extractFindingId(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  if (!("findingId" in payload)) return null;
  const candidate = (payload as Record<string, unknown>)["findingId"];
  if (typeof candidate !== "string") return null;
  return FindingIdSchema.safeParse(candidate).success ? candidate : null;
}

/**
 * Resolve the resume cursor. An explicit `Last-Event-ID` header wins (the
 * browser's own acknowledgement); otherwise `?after=` applies; default 0.
 * The cursor is a per-scan sequence number, not a permission — authorization
 * is enforced separately before streaming starts.
 */
export function parseResumeCursor(args: {
  lastEventId: string | null | undefined;
  after: unknown;
}): number {
  const header =
    typeof args.lastEventId === "string" ? args.lastEventId.trim() : "";
  try {
    if (header !== "") return ScanEventCursorSchema.parse(header);
    return ScanEventCursorSchema.parse(args.after ?? 0);
  } catch (error) {
    throw new EventValidationError(
      error instanceof Error ? error.message : "invalid event cursor",
    );
  }
}

export interface StreamScanEventsOptions {
  store: EventStore;
  hub?: EventHub;
  scanId: ScanId;
  workspaceId: WorkspaceId;
  after: number;
  limit?: number;
  pollIntervalMs?: number;
  heartbeatMs?: number;
  signal?: AbortSignal;
}

/**
 * Replay persisted history in order, then poll for new events until aborted.
 * - Every batch is re-read from the store after the last delivered seq, so
 *   gaps (slow writers, failed polls) recover on the next iteration.
 * - Delivery dedupes by seq, so overlapping batches never repeat on the wire.
 * - Heartbeats keep intermediaries from closing idle connections.
 * - Abort only ends this stream; the background scan is untouched.
 */
export async function* streamScanEvents(
  options: StreamScanEventsOptions,
): AsyncGenerator<string, void, void> {
  const {
    store,
    hub,
    scanId,
    workspaceId,
    signal,
    limit = 100,
    pollIntervalMs = POLL_INTERVAL_MS_DEFAULT,
    heartbeatMs = HEARTBEAT_MS_DEFAULT,
  } = options;
  let lastDelivered = options.after;
  let lastWriteAt = Date.now();

  for (;;) {
    if (signal?.aborted) return;
    const batch = await store.list(scanId, workspaceId, {
      afterSeq: lastDelivered,
      limit,
    });
    for (const event of batch) {
      if (signal?.aborted) return;
      if (event.seq <= lastDelivered) continue;
      const { name, payload } = toBrowserPayload(event);
      yield encodeSseEvent(event.seq, name, JSON.stringify(payload));
      lastDelivered = event.seq;
      lastWriteAt = Date.now();
    }
    const outcome = await waitForMore(hub, scanId, signal, pollIntervalMs);
    if (outcome === "aborted") return;
    if (Date.now() - lastWriteAt >= heartbeatMs) {
      if (signal?.aborted) return;
      yield encodeHeartbeat();
      lastWriteAt = Date.now();
    }
  }
}

async function waitForMore(
  hub: EventHub | undefined,
  scanId: string,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<"wake" | "aborted"> {
  if (signal?.aborted) return "aborted";
  if (!hub || !signal) {
    await sleep(timeoutMs, signal);
    return signal?.aborted ? "aborted" : "wake";
  }
  await Promise.race([hub.waitFor(scanId, signal), sleep(timeoutMs, signal)]);
  return signal.aborted ? "aborted" : "wake";
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
