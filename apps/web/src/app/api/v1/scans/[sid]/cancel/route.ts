import { DbError } from "@highcastle/db";
import { requestWorkspace } from "@/server/authz";
import { parseUuid } from "@/server/http";
import { handle } from "@/server/route";
import { cancelScanFlow } from "@/server/scans";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ sid: string }> },
) {
  const { sid } = await context.params;
  return handle(request, "POST /api/v1/scans/:sid/cancel", { sid }, async ({ deps }) => {
    if (!parseUuid(sid)) throw new DbError("validation_error", "invalid scan id");
    return cancelScanFlow(deps, {
      scanId: sid,
      workspaceId: requestWorkspace(deps.session),
    });
  });
}
