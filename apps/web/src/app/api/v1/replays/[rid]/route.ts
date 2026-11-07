import { DbError } from "@highcastle/db";
import { requestWorkspace } from "@/server/authz";
import { parseUuid } from "@/server/http";
import { getReplayFlow } from "@/server/replays";
import { handle } from "@/server/route";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ rid: string }> },
) {
  const { rid } = await context.params;
  return handle(request, "GET /api/v1/replays/:rid", { rid }, async ({ deps }) => {
    if (!parseUuid(rid)) throw new DbError("validation_error", "invalid replay id");
    return getReplayFlow(deps, {
      replayId: rid,
      workspaceId: requestWorkspace(deps.session),
    });
  });
}
