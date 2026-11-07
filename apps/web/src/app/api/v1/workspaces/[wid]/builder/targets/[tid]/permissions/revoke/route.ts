import { DbError } from "@highcastle/db";
import { parseUuid } from "@/server/http";
import { handle } from "@/server/route";
import { revokeSitePermissionFlow } from "@/server/builder";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ wid: string; tid: string }> },
) {
  const { wid, tid } = await context.params;
  return handle(
    request,
    "POST /api/v1/workspaces/:wid/builder/targets/:tid/permissions/revoke",
    { wid, tid },
    async ({ deps }) => {
      if (!parseUuid(wid) || !parseUuid(tid)) {
        throw new DbError("validation_error", "invalid id");
      }
      return revokeSitePermissionFlow(deps, wid, tid);
    },
  );
}
