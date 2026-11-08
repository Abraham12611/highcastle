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
 *
 * Session resolution is deliberately side-effect free: account first-
 * workspace provisioning is the E12 canonical transaction
 * (`ensureAccountWorkspace`, packages/db) invoked by the tenant-navigation
 * flows — never duplicated here (coordinator order, issue #72).
 */

import { getHighCastleSession } from "./auth/session";
import type { HighCastleSession } from "@/lib/auth/session-core";

export type Session = HighCastleSession;

export async function resolveSession(request: Request): Promise<Session | null> {
  return getHighCastleSession(request.headers);
}

export function sessionUserId(session: Session): string | null {
  return session.kind === "account" ? session.userId : null;
}
