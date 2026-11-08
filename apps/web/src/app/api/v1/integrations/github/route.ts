import { handle } from "@/server/route";
import { disconnectFlow, statusFlow } from "@/server/github-source";

export const dynamic = "force-dynamic";

/** GET — owner's GitHub connection + selected source state. */
export async function GET(request: Request) {
  return handle(request, "GET /api/v1/integrations/github", {}, async ({ deps }) =>
    statusFlow(deps),
  );
}

/** DELETE — disconnect/revoke the GitHub connection. */
export async function DELETE(request: Request) {
  return handle(request, "DELETE /api/v1/integrations/github", {}, async ({ deps }) =>
    disconnectFlow(deps),
  );
}
