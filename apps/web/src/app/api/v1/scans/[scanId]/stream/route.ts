import { findScanTenant, getScan, listScanEvents } from "@highcastle/db";
import { ScanEventSchema } from "@highcastle/contracts";
import { getHighCastleSession } from "@/server/auth/session";
import { authorizeScanRead } from "@/server/auth/authorize";
import { dbMembership } from "@/server/authz";
import { getRequestDb } from "@/server/db";
import { mapScanEvent } from "@/server/mappers";
import { failClosedDeps, type StreamDeps } from "./deps";
import { handleScanStream } from "./handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Production SSE: request-signed session -> L02 scan/tenant authorization ->
 * persisted L02 event rows. No process-global 'configure' call, fake store,
 * or permanently-failing adapter in the actual request path.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ scanId: string }> | { scanId: string } },
): Promise<Response> {
  const { scanId } = await context.params;
  const url = new URL(request.url);
  const session = await getHighCastleSession(request.headers);
  const common = {
    scanIdParam: scanId,
    lastEventId: request.headers.get("last-event-id"),
    afterParam: url.searchParams.get("after"),
    signal: request.signal,
  };

  if (!session) {
    return handleScanStream({
      ...common,
      session: null,
      deps: failClosedDeps(),
    });
  }

  let db: Awaited<ReturnType<typeof getRequestDb>>;
  try {
    db = await getRequestDb();
  } catch {
    return Response.json(
      { error: { code: "unavailable", message: "event stream database unavailable" } },
      { status: 503 },
    );
  }

  // Demo sessions stay pinned to the fixed lab workspace. Account sessions
  // resolve the scan's owning tenant, then `authorizeScanRead` enforces the
  // real membership check — a guessed foreign scan id resolves like a
  // missing one, never leaked. (issue #72 / E12)

  const deps: StreamDeps = {
    store: {
      async list(id, workspaceId, options) {
        const rows = await listScanEvents(db, workspaceId, id, {
          afterSeq: options?.afterSeq ?? 0,
          limit: options?.limit ?? 100,
        });
        return rows.map((row) => ScanEventSchema.parse(mapScanEvent(row)));
      },
    },
    authorizer: {
      async authorizeScanRead(_streamSession, id) {
        return authorizeScanRead(
          session,
          id,
          async (candidate) => {
            if (session.kind === "demo") {
              const scan = await getScan(db, session.workspaceId, candidate);
              if (!scan || scan.projectId !== session.projectId) return null;
              return { workspaceId: scan.workspaceId, projectId: scan.projectId };
            }
            const tenant = await findScanTenant(db, candidate);
            if (!tenant || !tenant.projectId) return null;
            return { workspaceId: tenant.workspaceId, projectId: tenant.projectId };
          },
          dbMembership(db),
        );
      },
    },
  };

  return handleScanStream({
    ...common,
    session: { userId: session.userId },
    deps,
  });
}
