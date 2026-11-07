import { DbError } from "@highcastle/db";
import { requestWorkspace } from "@/server/authz";
import { parseUuid } from "@/server/http";
import { getCurrentScopeFlow } from "@/server/me";
import { handle } from "@/server/route";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ pid: string }> },
) {
  const { pid } = await context.params;
  return handle(
    request,
    "GET /api/v1/projects/:pid/authorization-scopes/current",
    { pid },
    async ({ deps }) => {
      if (!parseUuid(pid)) throw new DbError("validation_error", "invalid project id");
      return getCurrentScopeFlow(deps, {
        workspaceId: requestWorkspace(deps.session),
        projectId: pid,
      });
    },
  );
}
