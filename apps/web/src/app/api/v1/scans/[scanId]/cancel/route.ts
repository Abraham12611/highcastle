import { DbError, findScanTenant } from "@highcastle/db";
import { authorizeResourceTenant } from "@/server/authz";
import { parseUuid } from "@/server/http";
import { handle } from "@/server/route";
import { cancelScanFlow } from "@/server/scans";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ scanId: string }> }) {
  const { scanId } = await context.params;
  return handle(request, "POST /api/v1/scans/:scanId/cancel", { scanId }, async ({ deps }) => {
    if (!parseUuid(scanId)) throw new DbError("validation_error", "invalid scan id");
    return cancelScanFlow(deps, {
      scanId: scanId,
      workspaceId: (
        await authorizeResourceTenant(deps.db, deps.session, () => findScanTenant(deps.db, scanId))
      ).workspaceId,
    });
  });
}
