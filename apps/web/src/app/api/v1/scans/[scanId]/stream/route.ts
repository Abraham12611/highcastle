import { getScan, listScanEvents } from "@highcastle/db";
import { ScanEventSchema } from "@highcastle/contracts";
import { DEMO_WORKSPACE_ID } from "@/lib/auth/session-core";
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

  // Demo is the only supported unscoped scan namespace. Account sessions
  // may access demo scans ONLY through actual demo workspace membership.
  // Non-demo account workspaces require a tenant-scoped route in a later release.
  const lookupWorkspaceId =
    session.kind === "demo" ? session.workspaceId : DEMO_WORKSPACE_ID;

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
            const scan = await getScan(db, lookupWorkspaceId, candidate);
            if (!scan) return null;
            if (session.kind === "demo" && scan.projectId !== session.projectId) {
              return null;
            }
            return { workspaceId: scan.workspaceId, projectId: scan.projectId };
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
