import { DbError, findScanTenant } from "@highcastle/db";
import { authorizeResourceTenant } from "@/server/authz";
import { parseUuid } from "@/server/http";
import { handle } from "@/server/route";
import { listEventsFlow } from "@/server/scans";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ scanId: string }> }) {
  const { scanId } = await context.params;
  return handle(
    request,
    "GET /api/v1/scans/:scanId/events",
    { scanId },
    async ({ deps, searchParams }) => {
      if (!parseUuid(scanId)) throw new DbError("validation_error", "invalid scan id");
      return listEventsFlow(deps, {
        scanId: scanId,
        workspaceId: (
          await authorizeResourceTenant(deps.db, deps.session, () =>
            findScanTenant(deps.db, scanId),
          )
        ).workspaceId,
        after: searchParams.get("after") ?? 0,
      });
    },
  );
}
