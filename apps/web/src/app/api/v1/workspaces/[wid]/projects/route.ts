import { DbError } from "@highcastle/db";
import { parseUuid } from "@/server/http";
import { createProjectFlow, listProjectsFlow } from "@/server/me";
import { handle } from "@/server/route";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ wid: string }> }) {
  const { wid } = await context.params;
  return handle(request, "GET /api/v1/workspaces/:wid/projects", { wid }, async ({ deps }) => {
    if (!parseUuid(wid)) {
      throw new DbError("validation_error", "invalid workspace id");
    }
    return listProjectsFlow(deps, { workspaceId: wid });
  });
}

export async function POST(request: Request, context: { params: Promise<{ wid: string }> }) {
  const { wid } = await context.params;
  return handle(request, "POST /api/v1/workspaces/:wid/projects", { wid }, async ({ deps }) => {
    if (!parseUuid(wid)) {
      throw new DbError("validation_error", "invalid workspace id");
    }
    return createProjectFlow(deps, {
      workspaceId: wid,
      body: await request.json().catch(() => undefined),
    });
  });
}
