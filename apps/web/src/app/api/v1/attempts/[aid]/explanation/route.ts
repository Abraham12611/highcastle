import { handle } from "@/server/route";
import { liveDeps } from "./deps";
import { readAttemptExplanation } from "./handler";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/attempts/:aid/explanation — latest stored post-execution
 * explanation for one attempt (Engineer 8, issue #55). Production path
 * binds the real L02 readers and workspace/project authorization; see
 * `deps.ts`. Returns 404 when absent; the finding UI renders unavailable.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ aid: string }> },
) {
  const { aid } = await context.params;
  return handle(request, "GET /api/v1/attempts/:aid/explanation", { aid }, async ({ deps }) => {
    const data = await readAttemptExplanation(deps.db, deps.session, aid, liveDeps());
    return { status: 200, body: { data } };
  });
}
