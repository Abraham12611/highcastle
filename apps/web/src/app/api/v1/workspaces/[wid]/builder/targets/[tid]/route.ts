import { DbError } from "@highcastle/db";
import { parseUuid } from "@/server/http";
import { handle } from "@/server/route";
import { getBuilderTargetFlow } from "@/server/builder";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ wid: string; tid: string }> },
) {
  const { wid, tid } = await context.params;
  return handle(
    request,
    "GET /api/v1/workspaces/:wid/builder/targets/:tid",
    { wid, tid },
    async ({ deps }) => {
      if (!parseUuid(wid) || !parseUuid(tid)) {
        throw new DbError("validation_error", "invalid id");
      }
      return getBuilderTargetFlow(deps, wid, tid);
    },
  );
}
