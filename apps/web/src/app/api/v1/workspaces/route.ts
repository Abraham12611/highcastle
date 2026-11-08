import { handle } from "@/server/route";
import { createWorkspaceFlow, listWorkspacesFlow } from "@/server/me";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(request, "GET /api/v1/workspaces", {}, async ({ deps }) =>
    listWorkspacesFlow(deps),
  );
}

export async function POST(request: Request) {
  return handle(request, "POST /api/v1/workspaces", {}, async ({ deps }) =>
    createWorkspaceFlow(deps, {
      body: await request.json().catch(() => undefined),
    }),
  );
}
