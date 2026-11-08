import { DbError, findScanTenant } from "@highcastle/db";
import { authorizeResourceTenant } from "@/server/authz";
import { parseUuid } from "@/server/http";
import { handle } from "@/server/route";
import { listContainmentFlow } from "@/server/scans";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ scanId: string }> }) {
  const { scanId } = await context.params;
  return handle(request, "GET /api/v1/scans/:scanId/containment", { scanId }, async ({ deps }) => {
    if (!parseUuid(scanId)) throw new DbError("validation_error", "invalid scan id");
    return listContainmentFlow(deps, {
      scanId: scanId,
      workspaceId: (
        await authorizeResourceTenant(deps.db, deps.session, () => findScanTenant(deps.db, scanId))
      ).workspaceId,
    });
  });
}
