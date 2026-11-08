import { DbError } from "@highcastle/db";
import { parseUuid } from "@/server/http";
import { handle } from "@/server/route";
import { getPassiveReconFlow } from "@/server/builder";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ wid: string; tid: string; rid: string }> },
) {
  const { wid, tid, rid } = await context.params;
  return handle(
    request,
    "GET /api/v1/workspaces/:wid/builder/targets/:tid/recon/:rid",
    { wid, tid, rid },
    async ({ deps }) => {
      if (!parseUuid(wid) || !parseUuid(tid) || !parseUuid(rid)) {
        throw new DbError("validation_error", "invalid id");
      }
      return getPassiveReconFlow(deps, wid, tid, rid);
    },
  );
}
