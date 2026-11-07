import { DbError } from "@highcastle/db";
import { CreateBuilderProjectRequestSchema } from "@highcastle/contracts";
import { parseBody, parseUuid } from "@/server/http";
import { handle } from "@/server/route";
import { createBuilderProjectFlow } from "@/server/builder";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ wid: string }> }) {
  const { wid } = await context.params;
  return handle(
    request,
    "POST /api/v1/workspaces/:wid/builder/projects",
    { wid },
    async ({ deps }) => {
      if (!parseUuid(wid)) throw new DbError("validation_error", "invalid workspace id");
      const body = await parseBody(request, CreateBuilderProjectRequestSchema);
      return createBuilderProjectFlow(deps, wid, body);
    },
  );
}
