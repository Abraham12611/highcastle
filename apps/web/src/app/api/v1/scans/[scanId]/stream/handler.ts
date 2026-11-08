import {
  API_ERROR_HTTP_STATUS,
  ScanEventCursorSchema,
  ScanEventSchema,
  ScanIdSchema,
  fail,
  type ScanEvent,
} from "@highcastle/contracts";
import type {
  StreamDeps,
  StreamScanScope,
  StreamSession,
} from "./deps";

/**
 * Authenticated, workspace-scoped SSE endpoint core.
 *
 * Order of checks (each failure is a closed JSON response, never a stream):
 * 1. `scanId` must be a UUID → 400. 2. Signed-in session required → 401.
 * 3. `authorizeScanRead` must return the scan's workspace scope → 404
 *    (unknown and foreign scans read identically — no existence leak).
 * 4. Resume cursor (`Last-Event-ID` wins over `?after=`) must be a
 *    non-negative integer → 400.
 *
 * The stream then replays persisted history in order and polls for new
 * events. Only allowlisted browser-safe fields leave the server; the client
 * disconnecting (abort) ends the stream without touching the background scan.
 */

export interface HandleStreamRequest {
  scanIdParam: string;
  lastEventId: string | null;
  afterParam: unknown;
  session: StreamSession | null;
  deps: StreamDeps;
  signal?: AbortSignal;
}

const HISTORY_BATCH = 100;

function errorResponse(
  code: "validation_error" | "unauthorized" | "not_found" | "unavailable",
  message: string,
): Response {
  const status = API_ERROR_HTTP_STATUS[code];
  return Response.json(fail(code, message, crypto.randomUUID()), { status });
}

/** Browser-safe projection: scalar observation fields plus `findingId` for
 * deep-links. `payloadRedacted` and every other stored field stay server-side. */
export function toBrowserFrame(event: ScanEvent): string {
  const body: Record<string, unknown> = {
    scanId: event.scanId,
    seq: event.seq,
    phase: event.phase,
    safeSummary: event.safeSummary,
    attemptId: event.attemptId ?? null,
    occurredAt: event.occurredAt,
  };
  const findingId = extractFindingId(event.payloadRedacted);
  if (findingId !== null) body["findingId"] = findingId;
  return `id: ${event.seq}\nevent: ${event.eventType}\ndata: ${JSON.stringify(body)}\n\n`;
}

function extractFindingId(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  if (!("findingId" in payload)) return null;
  const candidate = (payload as Record<string, unknown>)["findingId"];
  return typeof candidate === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      candidate,
    )
    ? candidate
    : null;
}

export function parseCursor(
  lastEventId: string | null,
  afterParam: unknown,
): number {
  const header = typeof lastEventId === "string" ? lastEventId.trim() : "";
  // Mirrors worker `parseResumeCursor`: the header is the browser's own
  // acknowledgement and wins; the cursor is a per-scan seq, not a permission.
  return header !== ""
    ? ScanEventCursorSchema.parse(header)
    : ScanEventCursorSchema.parse(afterParam ?? 0);
}

export async function handleScanStream(
  request: HandleStreamRequest,
): Promise<Response> {
  const scanIdResult = ScanIdSchema.safeParse(request.scanIdParam);
  if (!scanIdResult.success) {
    return errorResponse("validation_error", "invalid scan id");
  }
  if (request.session === null) {
    return errorResponse("unauthorized", "sign in required");
  }
  let scope: StreamScanScope | null;
  try {
    scope = await request.deps.authorizer.authorizeScanRead(
      request.session,
      scanIdResult.data,
    );
  } catch {
    return errorResponse("unavailable", "authorization unavailable");
  }
  if (scope === null) {
    return errorResponse("not_found", "scan not found");
  }
  let after: number;
  try {
    after = parseCursor(request.lastEventId, request.afterParam);
  } catch {
    return errorResponse("validation_error", "invalid event cursor");
  }

  const scanId = scanIdResult.data;
  const workspaceId = scope.workspaceId;
  const pollMs = request.deps.pollIntervalMs ?? 500;
  const beatMs = request.deps.heartbeatMs ?? 15000;
  // Internal stop signal: fires on browser disconnect (source cancel) or on
  // request abort. Either way only this stream ends — the scan continues.
  const stop = new AbortController();
  const onExternalAbort = (): void => stop.abort();
  request.signal?.addEventListener("abort", onExternalAbort, { once: true });
  const stopped = (): boolean => stop.signal.aborted;
  let last = after;
  let lastWriteAt = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (chunk: string): void => {
        lastWriteAt = Date.now();
        controller.enqueue(encoder.encode(chunk));
      };
      try {
        for (;;) {
          if (stopped()) break;
          let batch: ScanEvent[];
          try {
            batch = await request.deps.store.list(scanId, workspaceId, {
              afterSeq: last,
              limit: HISTORY_BATCH,
            });
          } catch {
            send(
              `event: error\ndata: ${JSON.stringify({ message: "event stream unavailable" })}\n\n`,
            );
            break;
          }
          for (const raw of batch) {
            if (stopped()) break;
            const parsed = ScanEventSchema.safeParse(raw);
            if (!parsed.success) {
              const seq =
                typeof (raw as { seq?: unknown }).seq === "number"
                  ? (raw as { seq: number }).seq
                  : last;
              last = Math.max(last, seq);
              continue;
            }
            const event = parsed.data;
            if (event.seq <= last) continue;
            send(toBrowserFrame(event));
            last = event.seq;
          }
          await sleepOrAbort(pollMs, stop.signal);
          if (stopped()) break;
          if (Date.now() - lastWriteAt >= beatMs) {
            controller.enqueue(encoder.encode(": heartbeat\n\n"));
            lastWriteAt = Date.now();
          }
        }
      } finally {
        request.signal?.removeEventListener("abort", onExternalAbort);
        controller.close();
      }
    },
    cancel() {
      // Browser disconnected: end this stream. The durable scan keeps
      // running; the client resumes with Last-Event-ID and loses nothing.
      stop.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function sleepOrAbort(ms: number, signal?: AbortSignal): Promise<void> {
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
