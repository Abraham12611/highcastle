/**
 * POST /api/auth/demo — mint a limited, server-signed demo session (H).
 * DELETE /api/auth/demo — revoke it.
 *
 * The demo session is the ONLY way a public visitor enters the synthetic
 * testing flow. It is scoped to the owned demo workspace + `target-lab` alias
 * by construction (see authorize.ts), is HMAC-signed server-side, expires in
 * 1h, and is rate-limited per client. Guests can never select a host, pack or
 * workspace.
 */

import {
  cookieHeader,
  DEMO_COOKIE,
  DEMO_SESSION_TTL_SECONDS,
  expiredCookieHeader,
  newDemoSession,
  issueSessionCookieValue,
} from "../../../../lib/auth/session-core";
import { rateLimit } from "../../../../lib/auth/rate-limit";
import { sessionSecret } from "../../../../server/auth/session";
import { assertSameOrigin } from "../../../../server/auth/csrf";
import { clientIp } from "../../../../server/http";

const MINT_LIMIT_PER_MINUTE = 10;

export async function POST(request: Request): Promise<Response> {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  if (!rateLimit(`demo-mint:${clientIp(request)}`, MINT_LIMIT_PER_MINUTE)) {
    return Response.json(
      { error: { code: "RATE_LIMITED", message: "Too many demo sessions. Try again shortly." } },
      { status: 429 },
    );
  }

  const secret = sessionSecret();
  if (!secret) {
    return Response.json(
      { error: { code: "AUTH_NOT_CONFIGURED", message: "Demo sessions unavailable." } },
      { status: 503 },
    );
  }

  const session = newDemoSession();
  const cookie = issueSessionCookieValue(session, secret);
  return Response.json(
    {
      session: {
        kind: session.kind,
        userId: session.userId,
        expiresAt: new Date(session.expiresAt).toISOString(),
        workspaceId: session.workspaceId,
        projectId: session.projectId,
        targetAlias: session.targetAlias,
      },
      notice:
        "Limited demo session: read-only access to the owned synthetic invoice lab. " +
        "Target, pack and scope are fixed by the server.",
    },
    {
      status: 201,
      headers: { "set-cookie": cookieHeader(DEMO_COOKIE, cookie, { maxAge: DEMO_SESSION_TTL_SECONDS }) },
    },
  );
}

export async function DELETE(request: Request): Promise<Response> {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  return Response.json(
    { status: "revoked" },
    { status: 200, headers: { "set-cookie": expiredCookieHeader(DEMO_COOKIE) } },
  );
}
