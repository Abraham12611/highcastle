import { DbError } from "@highcastle/db";
import { GrantSitePermissionRequestSchema } from "@highcastle/contracts";
import { parseBody, parseUuid } from "@/server/http";
import { handle } from "@/server/route";
import { grantSitePermissionFlow } from "@/server/builder";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ wid: string; tid: string }> },
) {
  const { wid, tid } = await context.params;
  return handle(
    request,
    "POST /api/v1/workspaces/:wid/builder/targets/:tid/permissions",
    { wid, tid },
    async ({ deps }) => {
      if (!parseUuid(wid) || !parseUuid(tid)) {
        throw new DbError("validation_error", "invalid id");
      }
      const body = await parseBody(request, GrantSitePermissionRequestSchema);
      return grantSitePermissionFlow(deps, wid, tid, {
        allowedPaths: body.allowedPaths,
      });
    },
  );
}
