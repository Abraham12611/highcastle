/**
 * Clerk session verification (L05) — the REAL account path.
 *
 * Verifies the Clerk `__session` JWT (or `Authorization: Bearer`) using the
 * development instance configured via env. Returns a normalized account
 * identity; all downstream code keeps consuming the existing
 * `AccountSession` shape — nothing else changes.
 *
 * DEV-ONLY: this is a Clerk development instance, NOT production-ready.
 * Before public launch, an owner must swap to a Clerk production instance.
 */

import { verifyToken, type VerifyTokenOptions } from "@clerk/backend";

export const CLERK_SESSION_COOKIE = "__session" as const;

export interface ClerkIdentity {
  /** Stable Clerk user id — `user_…`; mapped to an internal UUID by membership. */
  clerkUserId: string;
  sessionId: string;
  expiresAt: number; // ms epoch
}

export interface ClerkEnv {
  secretKey: string;
  publishableKey: string;
}

/** Clerk env resolution — missing config disables the account path (fail closed). */
export function clerkEnv(env: NodeJS.ProcessEnv = process.env): ClerkEnv | null {
  const secretKey = env.CLERK_SECRET_KEY;
  const publishableKey = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!secretKey || !publishableKey) return null;
  return { secretKey, publishableKey };
}

function cookieValue(headers: Headers, name: string): string | null {
  const raw = headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

/**
 * Verify the Clerk session token from request headers. Returns null on
 * missing/forged/expired tokens — never throws into request paths.
 */
export async function verifyClerkSession(
  headers: Headers,
  env: ClerkEnv | null = clerkEnv(),
): Promise<ClerkIdentity | null> {
  if (env === null) return null;
  const token =
    cookieValue(headers, CLERK_SESSION_COOKIE) ??
    (() => {
      const auth = headers.get("authorization");
      return auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    })();
  if (!token) return null;

  const opts: VerifyTokenOptions = {
    secretKey: env.secretKey,
    // Authorized parties: only our own origin may present tokens. When unset
    // (local dev) the SDK skips the check — production must set it.
    ...(process.env.NEXT_PUBLIC_CLERK_FRONTEND_API
      ? { authorizedParties: [process.env.NEXT_PUBLIC_CLERK_FRONTEND_API] }
      : {}),
  };
  try {
    const payload = await verifyToken(token, opts);
    const sub = payload.sub;
    const sid = payload.sid;
    if (typeof sub !== "string" || typeof sid !== "string") return null;
    const exp = typeof payload.exp === "number" ? payload.exp * 1000 : 0;
    return { clerkUserId: sub, sessionId: sid, expiresAt: exp };
  } catch {
    return null; // forged/invalid/expired → unauthenticated
  }
}
