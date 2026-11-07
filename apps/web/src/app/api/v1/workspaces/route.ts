import { handle } from "@/server/route";
import { listWorkspacesFlow } from "@/server/me";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(request, "GET /api/v1/workspaces", {}, async ({ deps }) =>
    listWorkspacesFlow(deps),
  );
}
