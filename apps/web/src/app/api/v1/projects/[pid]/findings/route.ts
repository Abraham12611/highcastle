import { DbError } from "@highcastle/db";
import { requestWorkspace } from "@/server/authz";
import { parsePagination, parseUuid } from "@/server/http";
import { handle } from "@/server/route";
import { listFindingsFlow } from "@/server/findings";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ pid: string }> },
) {
  const { pid } = await context.params;
  return handle(
    request,
    "GET /api/v1/projects/:pid/findings",
    { pid },
    async ({ deps, searchParams }) => {
      if (!parseUuid(pid)) throw new DbError("validation_error", "invalid project id");
      const { limit } = parsePagination(searchParams);
      void limit;
      const severity = searchParams.get("severity") ?? undefined;
      const remediationStatus = searchParams.get("status") ?? undefined;
      const confidence = searchParams.get("confidence") ?? undefined;
      return listFindingsFlow(deps, {
        workspaceId: requestWorkspace(deps.session),
        projectId: pid,
        ...(severity === undefined ? {} : { severity }),
        ...(remediationStatus === undefined ? {} : { remediationStatus }),
        ...(confidence === undefined ? {} : { confidence }),
      });
    },
  );
}
