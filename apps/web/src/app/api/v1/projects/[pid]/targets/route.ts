import { DbError, findProjectTenant } from "@highcastle/db";
import { authorizeResourceTenant } from "@/server/authz";
import { parseUuid } from "@/server/http";
import { listTargetsFlow } from "@/server/me";
import { handle } from "@/server/route";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ pid: string }> }) {
  const { pid } = await context.params;
  return handle(request, "GET /api/v1/projects/:pid/targets", { pid }, async ({ deps }) => {
    if (!parseUuid(pid)) throw new DbError("validation_error", "invalid project id");
    return listTargetsFlow(deps, {
      workspaceId: (
        await authorizeResourceTenant(deps.db, deps.session, () => findProjectTenant(deps.db, pid))
      ).workspaceId,
      projectId: pid,
    });
  });
}

// Guests cannot change targets; provisioning is out of demo scope for
// everyone. Fail closed with an explicit code instead of a missing route.
export async function POST(request: Request) {
  return handle(request, "POST /api/v1/projects/:pid/targets", {}, () => {
    throw new DbError("forbidden", "target provisioning is not available in the demo");
  });
}
