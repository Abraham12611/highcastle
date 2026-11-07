import { DbError } from "@highcastle/db";
import { requestWorkspace } from "@/server/authz";
import { parseUuid } from "@/server/http";
import { listOccurrencesFlow } from "@/server/findings";
import { handle } from "@/server/route";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ fid: string }> },
) {
  const { fid } = await context.params;
  return handle(
    request,
    "GET /api/v1/findings/:fid/occurrences",
    { fid },
    async ({ deps }) => {
      if (!parseUuid(fid)) throw new DbError("validation_error", "invalid finding id");
      return listOccurrencesFlow(deps, {
        findingId: fid,
        workspaceId: requestWorkspace(deps.session),
      });
    },
  );
}
