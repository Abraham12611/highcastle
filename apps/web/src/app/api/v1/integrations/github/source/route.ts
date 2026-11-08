import { handle } from "@/server/route";
import { selectRepoFlow, statusFlow } from "@/server/github-source";

export const dynamic = "force-dynamic";

/** GET — the selected source snapshot + recon (owner-scoped). */
export async function GET(request: Request) {
  return handle(request, "GET /api/v1/integrations/github/source", {}, async ({ deps }) =>
    statusFlow(deps),
  );
}

/** POST — explicit repository opt-in; records repo identity + SHA. */
export async function POST(request: Request) {
  let body: { repoId?: unknown; fullName?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    /* fall through to validation */
  }
  const repoId = typeof body.repoId === "string" ? body.repoId : "";
  const fullName = typeof body.fullName === "string" ? body.fullName : "";
  return handle(request, "POST /api/v1/integrations/github/source", {}, async ({ deps }) =>
    selectRepoFlow(deps, { repoId, fullName }),
  );
}
