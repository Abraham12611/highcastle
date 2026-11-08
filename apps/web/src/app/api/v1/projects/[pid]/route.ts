import { DbError, findProjectTenant } from "@highcastle/db";
import { authorizeResourceTenant } from "@/server/authz";
import { parseUuid } from "@/server/http";
import { getProjectFlow } from "@/server/me";
import { handle } from "@/server/route";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ pid: string }> }) {
  const { pid } = await context.params;
  return handle(request, "GET /api/v1/projects/:pid", { pid }, async ({ deps }) => {
    if (!parseUuid(pid)) throw new DbError("validation_error", "invalid project id");
    return getProjectFlow(deps, {
      workspaceId: (
        await authorizeResourceTenant(deps.db, deps.session, () => findProjectTenant(deps.db, pid))
      ).workspaceId,
      projectId: pid,
    });
  });
}
