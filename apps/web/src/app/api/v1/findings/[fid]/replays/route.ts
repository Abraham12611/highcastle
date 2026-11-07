import { DbError, getFinding } from "@highcastle/db";
import { requestWorkspace } from "@/server/authz";
import { parseUuid } from "@/server/http";
import { createReplayFlow } from "@/server/replays";
import { handle } from "@/server/route";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ fid: string }> },
) {
  const { fid } = await context.params;
  return handle(
    request,
    "POST /api/v1/findings/:fid/replays",
    { fid },
    async ({ deps }) => {
      if (!parseUuid(fid)) throw new DbError("validation_error", "invalid finding id");
      const workspaceId = requestWorkspace(deps.session);
      // Project is resolved from the finding itself (tenant-checked inside).
      const finding = await getFinding(deps.db, workspaceId, fid);
      if (!finding) throw DbError.notFound("finding", fid);
      return createReplayFlow(deps, {
        workspaceId,
        projectId: finding.projectId,
        findingId: fid,
        body: await request.json().catch(() => undefined),
      });
    },
  );
}
