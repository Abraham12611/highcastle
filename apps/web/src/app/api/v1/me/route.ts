import { handle } from "@/server/route";
import { meFlow } from "@/server/me";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(request, "GET /api/v1/me", {}, async ({ deps }) => meFlow(deps));
}
