/**
 * Deterministic synthetic authentication for the target-lab.
 *
 * Two interchangeable credentials, both lab-only fixtures:
 *   1. `Authorization: Bearer <fixture token>` (e.g. lab-token-alice)
 *   2. `lab_session=<deterministic session id>` cookie from POST /api/auth/login
 *
 * There are no passwords, no external IdP and no real credentials. An unknown
 * or missing credential resolves to `null` and the endpoint emits 401.
 */

import type { IncomingMessage } from "node:http";
import type { Actor } from "./types.ts";
import { actorForSession, actorForToken, SESSION_COOKIE } from "./fixtures.ts";

function actorFromBearer(authorization: string | undefined): Actor | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(authorization.trim());
  return match ? actorForToken(match[1]!) : null;
}

function actorFromCookie(cookieHeader: string | undefined): Actor | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === SESSION_COOKIE) {
      return actorForSession(part.slice(eq + 1).trim());
    }
  }
  return null;
}

/** Bearer credentials take precedence over the session cookie. */
export function resolveActor(req: IncomingMessage): Actor | null {
  const authorization = req.headers.authorization;
  return (
    actorFromBearer(typeof authorization === "string" ? authorization : undefined) ??
    actorFromCookie(req.headers.cookie)
  );
}
