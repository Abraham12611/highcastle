/**
 * GET /api/auth/session — current session introspection for the app shell.
 * 401 when unauthenticated; otherwise returns the session claims (never the
 * cookie value or signing material).
 */

import { getHighCastleSession, unauthorized } from "../../../../server/auth/session";

export async function GET(request: Request): Promise<Response> {
  const session = await getHighCastleSession(request);
  if (!session) return unauthorized();
  return Response.json({
    session: {
      kind: session.kind,
      userId: session.userId,
      expiresAt: new Date(session.expiresAt).toISOString(),
      ...(session.kind === "demo"
        ? { workspaceId: session.workspaceId, projectId: session.projectId, targetAlias: session.targetAlias }
        : {}),
    },
  });
}
