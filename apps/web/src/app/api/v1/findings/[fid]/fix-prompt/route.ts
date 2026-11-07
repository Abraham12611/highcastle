import { DbError } from "@highcastle/db";
import { requestWorkspace } from "@/server/authz";
import { parseUuid } from "@/server/http";
import { fixPromptFlow } from "@/server/findings";
import { handle } from "@/server/route";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ fid: string }> },
) {
  const { fid } = await context.params;
  return handle(
    request,
    "POST /api/v1/findings/:fid/fix-prompt",
    { fid },
    async ({ deps }) => {
      if (!parseUuid(fid)) throw new DbError("validation_error", "invalid finding id");
      return fixPromptFlow(deps, {
        findingId: fid,
        workspaceId: requestWorkspace(deps.session),
      });
    },
  );
}
