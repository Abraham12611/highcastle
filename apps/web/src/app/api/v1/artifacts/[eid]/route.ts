import { DbError } from "@highcastle/db";
import { requestWorkspace } from "@/server/authz";
import { parseUuid } from "@/server/http";
import { getArtifactFlow } from "@/server/artifacts";
import { handle } from "@/server/route";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ eid: string }> },
) {
  const { eid } = await context.params;
  return handle(request, "GET /api/v1/artifacts/:eid", { eid }, async ({ deps }) => {
    if (!parseUuid(eid)) throw new DbError("validation_error", "invalid artifact id");
    return getArtifactFlow(deps, {
      artifactId: eid,
      workspaceId: requestWorkspace(deps.session),
    });
  });
}
