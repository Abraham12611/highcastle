import { handle } from "@/server/route";
import { reposFlow } from "@/server/github-source";

export const dynamic = "force-dynamic";

/** GET — paginated list of repositories the connected account can access. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const perPage = Math.min(100, Math.max(1, Number(url.searchParams.get("per_page")) || 30));
  return handle(request, "GET /api/v1/integrations/github/repos", {}, async ({ deps }) =>
    reposFlow(deps, { page, perPage }),
  );
}
