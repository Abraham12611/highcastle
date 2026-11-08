import { handle } from "@/server/route";
import { connectFlow } from "@/server/github-source";

export const dynamic = "force-dynamic";

/** POST — start the Composio-hosted GitHub OAuth link for the owner. */
export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  let callbackUrl = `${origin}/app/integrations/github`;
  try {
    const body = (await request.json()) as { callbackUrl?: unknown };
    if (typeof body.callbackUrl === "string" && body.callbackUrl.length < 2048) {
      callbackUrl = body.callbackUrl;
    }
  } catch {
    /* empty body uses the default callback */
  }
  return handle(request, "POST /api/v1/integrations/github/connect", {}, async ({ deps }) =>
    connectFlow(deps, { callbackUrl, appOrigin: origin }),
  );
}
