import {
  DEMO_COOKIE,
  issueSessionCookieValue,
  newDemoSession,
  type HighCastleSession,
} from "@/lib/auth/session-core";
import { sessionSecret } from "@/server/auth/session";

/**
 * Shared session fixtures for BFF tests. Sessions are real L05 artifacts —
 * server-minted HMAC-signed cookies resolved through `resolveSession`, never
 * hand-built `{ kind: "guest" }` literals.
 */

export function demoSession(): HighCastleSession {
  return newDemoSession();
}

/**
 * Account session fixture — the same `AccountSession` shape E5's session
 * resolver produces after `internalUserIdForClerk` maps a Clerk subject.
 */
export function accountSession(userId: string): HighCastleSession {
  return {
    kind: "account",
    userId,
    sessionId: `sess-${userId.slice(0, 8)}`,
    expiresAt: Date.now() + 3_600_000,
  };
}

export function signedCookieHeader(session: HighCastleSession): string {
  const secret = sessionSecret();
  if (!secret) throw new Error("no session secret available for tests");
  return `${DEMO_COOKIE}=${issueSessionCookieValue(session, secret)}`;
}

export function signedRequest(
  session: HighCastleSession,
  url = "https://app.test/api/v1/me",
  init: RequestInit = {},
): Request {
  return new Request(url, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      cookie: signedCookieHeader(session),
    },
  });
}
