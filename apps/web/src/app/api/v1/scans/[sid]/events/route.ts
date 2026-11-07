import { DbError } from "@highcastle/db";
import { requestWorkspace } from "@/server/authz";
import { parseUuid } from "@/server/http";
import { handle } from "@/server/route";
import { listEventsFlow } from "@/server/scans";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ sid: string }> },
) {
  const { sid } = await context.params;
  return handle(
    request,
    "GET /api/v1/scans/:sid/events",
    { sid },
    async ({ deps, searchParams }) => {
      if (!parseUuid(sid)) throw new DbError("validation_error", "invalid scan id");
      return listEventsFlow(deps, {
        scanId: sid,
        workspaceId: requestWorkspace(deps.session),
        after: searchParams.get("after") ?? 0,
      });
    },
  );
}
