import { failClosedDeps, resolveSession } from "./deps";
import { handleScanStream } from "./handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/v1/scans/:scanId/stream — delegated L17 SSE route.
 * Thin adapter: session → authorization → `handleScanStream`. All logic and
 * tests live in `handler.ts`; production wiring swaps `failClosedDeps()` for
 * L02/L05-backed adapters without touching this file's shape.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ scanId: string }> | { scanId: string } },
): Promise<Response> {
  const { scanId } = await context.params;
  const url = new URL(request.url);
  return handleScanStream({
    scanIdParam: scanId,
    lastEventId: request.headers.get("last-event-id"),
    afterParam: url.searchParams.get("after"),
    session: await resolveSession(),
    deps: failClosedDeps(),
    signal: request.signal,
  });
}
