import { DbError, findProjectTenant } from "@highcastle/db";
import { authorizeResourceTenant } from "@/server/authz";
import { parsePagination, parseUuid } from "@/server/http";
import { handle } from "@/server/route";
import { createScanFlow, listScansFlow } from "@/server/scans";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ pid: string }> }) {
  const { pid } = await context.params;
  return handle(
    request,
    "GET /api/v1/projects/:pid/scans",
    { pid },
    async ({ deps, searchParams }) => {
      if (!parseUuid(pid)) throw new DbError("validation_error", "invalid project id");
      const { limit, cursor } = parsePagination(searchParams);
      const status = searchParams.get("status") ?? undefined;
      return listScansFlow(deps, {
        workspaceId: (
          await authorizeResourceTenant(deps.db, deps.session, () =>
            findProjectTenant(deps.db, pid),
          )
        ).workspaceId,
        projectId: pid,
        ...(status === undefined ? {} : { status }),
        limit,
        ...(cursor === undefined ? {} : { cursor }),
      });
    },
  );
}

export async function POST(request: Request, context: { params: Promise<{ pid: string }> }) {
  const { pid } = await context.params;
  return handle(
    request,
    "POST /api/v1/projects/:pid/scans",
    { pid },
    async ({ deps, idempotencyKey }) => {
      if (!parseUuid(pid)) throw new DbError("validation_error", "invalid project id");
      return createScanFlow(deps, {
        workspaceId: (
          await authorizeResourceTenant(deps.db, deps.session, () =>
            findProjectTenant(deps.db, pid),
          )
        ).workspaceId,
        projectId: pid,
        body: await request.json().catch(() => undefined),
        idempotencyKey,
      });
    },
  );
}
