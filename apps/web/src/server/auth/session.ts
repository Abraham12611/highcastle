/**
 * Server-side session adapter for L17 (SSE) and L18 (BFF API).
 *
 * STABLE INTERFACE — wire these, do not re-implement cookie parsing:
 *
 *   import { getHighCastleSession, requireSession } from "@/server/auth/session";
 *   const session = await getHighCastleSession(request.headers);
 *   // → AccountSession | DemoSession | null   (null ⇒ HTTP 401)
 *
 * Both cookie kinds are HMAC-signed server mints, verified here on every call.
 * A tampered or expired cookie resolves to `null`. Callers must treat null as
 * unauthenticated — never fall back to query tokens or client claims.
 */

import {
  ACCOUNT_COOKIE,
  DEMO_COOKIE,
  verifySessionCookieValue,
  readCookie,
  type HighCastleSession,
} from "../../lib/auth/session-core";

/**
 * Signing secret resolution. `BETTER_AUTH_SECRET` is the provisioned auth
 * secret slot (see .env.example). In non-production environments a fixed
 * dev-only value is allowed so local dev/tests work; production fails closed.
 */
export function sessionSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.BETTER_AUTH_SECRET) return env.BETTER_AUTH_SECRET;
  if (env.NODE_ENV === "production") return null;
  return "dev-only-insecure-session-secret";
}

function headersOf(input: Headers | Request | { get(name: string): string | null }): { get(name: string): string | null } {
  return input instanceof Request ? input.headers : input;
}

/**
 * Resolve the caller's session from request headers.
 * Account session is checked first, then the demo cookie.
 */
export async function getHighCastleSession(
  input: Headers | Request,
): Promise<HighCastleSession | null> {
  const secret = sessionSecret();
  if (!secret) return null;
  const headers = headersOf(input);

  const account = readCookie(headers as Headers, ACCOUNT_COOKIE);
  if (account) {
    const session = verifySessionCookieValue(account, "account", secret);
    if (session) return session;
  }
  const demo = readCookie(headers as Headers, DEMO_COOKIE);
  if (demo) return verifySessionCookieValue(demo, "demo", secret);
  return null;
}

/** Compatibility view for L17: `StreamSession { userId }`. */
export async function resolveStreamSession(
  input: Headers | Request,
): Promise<{ userId: string } | null> {
  const session = await getHighCastleSession(input);
  return session ? { userId: session.userId } : null;
}

/** 401 helper for protected handlers. */
export function unauthorized(detail = "Authentication required"): Response {
  return Response.json({ error: { code: "UNAUTHENTICATED", message: detail } }, { status: 401 });
}
