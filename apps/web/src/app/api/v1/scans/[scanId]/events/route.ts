import { DbError } from "@highcastle/db";
import { requestWorkspace } from "@/server/authz";
import { parseUuid } from "@/server/http";
import { handle } from "@/server/route";
import { listEventsFlow } from "@/server/scans";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ scanId: string }> },
) {
  const { scanId } = await context.params;
  return handle(
    request,
    "GET /api/v1/scans/:scanId/events",
    { scanId },
    async ({ deps, searchParams }) => {
      if (!parseUuid(scanId)) throw new DbError("validation_error", "invalid scan id");
      return listEventsFlow(deps, {
        scanId: scanId,
        workspaceId: await requestWorkspace(deps.db, deps.session),
        after: searchParams.get("after") ?? 0,
      });
    },
  );
}
