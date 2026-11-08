import { DbError, findProjectTenant } from "@highcastle/db";
import { authorizeResourceTenant } from "@/server/authz";
import { parseUuid } from "@/server/http";
import { createTargetFlow, listTargetsFlow } from "@/server/me";
import { handle } from "@/server/route";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ pid: string }> },
) {
  const { pid } = await context.params;
  return handle(
    request,
    "GET /api/v1/projects/:pid/targets",
    { pid },
    async ({ deps }) => {
      if (!parseUuid(pid)) throw new DbError("validation_error", "invalid project id");
      return listTargetsFlow(deps, {
        workspaceId: (
          await authorizeResourceTenant(deps.db, deps.session, () =>
            findProjectTenant(deps.db, pid),
          )
        ).workspaceId,
        projectId: pid,
      });
    },
  );
}

/**
 * Register a target draft. Guests cannot change targets — the demo stays
 * pinned; accounts need owner/admin (management). The draft alone grants
 * nothing: execution requires verification + an approved scope.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ pid: string }> },
) {
  const { pid } = await context.params;
  return handle(
    request,
    "POST /api/v1/projects/:pid/targets",
    { pid },
    async ({ deps }) => {
      if (!parseUuid(pid)) throw new DbError("validation_error", "invalid project id");
      return createTargetFlow(deps, {
        workspaceId: (
          await authorizeResourceTenant(deps.db, deps.session, () =>
            findProjectTenant(deps.db, pid),
          )
        ).workspaceId,
        projectId: pid,
        body: await request.json().catch(() => undefined),
      });
    },
  );
}
