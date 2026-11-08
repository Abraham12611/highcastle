/**
 * Session seam for the BFF (L18 over L05).
 *
 * Every request resolves through L05's signed-session verification —
 * `getHighCastleSession(request.headers)` — which checks the HMAC-signed
 * `hc_account` / `hc_demo` cookies. There is no anonymous fallback: a
 * missing, expired, or forged cookie resolves to `null` and the route
 * wrapper answers 401. Demo sessions are server-pinned to the fixed
 * synthetic lab (workspace/project/target alias from L05); account
 * sessions require workspace membership (see authz.ts).
 */

import { getHighCastleSession } from "./auth/session";
import { provisionAccountWorkspace } from "./auth/membership";
import { getRequestDb, DatabaseUnavailable } from "./db";
import type { HighCastleSession } from "@/lib/auth/session-core";

export type Session = HighCastleSession;

export async function resolveSession(request: Request): Promise<Session | null> {
  const session = await getHighCastleSession(request.headers);
  // First-login account provisioning: a valid Clerk identity with no
  // memberships gets a personal workspace (idempotent, transactional).
  // Demo sessions are never provisioned — they stay pinned to the synthetic
  // tenant. A missing DB degrades gracefully; membership checks still fail
  // closed downstream.
  if (session?.kind === "account") {
    try {
      const db = await getRequestDb();
      await provisionAccountWorkspace(db, session.userId);
    } catch (err) {
      if (!(err instanceof DatabaseUnavailable)) throw err;
    }
  }
  return session;
}

export function sessionUserId(session: Session): string | null {
  return session.kind === "account" ? session.userId : null;
}
