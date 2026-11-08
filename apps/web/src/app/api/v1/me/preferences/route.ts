import { updatePreferencesFlow } from "@/server/me";
import { handle } from "@/server/route";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  return handle(request, "PATCH /api/v1/me/preferences", {}, async ({ deps }) =>
    updatePreferencesFlow(deps, {
      body: await request.json().catch(() => undefined),
    }),
  );
}
