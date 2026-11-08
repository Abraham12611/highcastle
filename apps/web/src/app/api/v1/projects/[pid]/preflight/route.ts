import { DbError } from "@highcastle/db";
import { requestWorkspace } from "@/server/authz";
import { parseUuid } from "@/server/http";
import { preflightFlow } from "@/server/preflight";
import { handle } from "@/server/route";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ pid: string }> },
) {
  const { pid } = await context.params;
  return handle(
    request,
    "POST /api/v1/projects/:pid/preflight",
    { pid },
    async ({ deps }) => {
      if (!parseUuid(pid)) throw new DbError("validation_error", "invalid project id");
      return preflightFlow(deps, {
        workspaceId: await requestWorkspace(deps.db, deps.session),
        projectId: pid,
        body: await request.json().catch(() => undefined),
      });
    },
  );
}
