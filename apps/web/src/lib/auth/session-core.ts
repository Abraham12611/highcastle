/**
 * HighCastle session core (L05) — signed, server-minted sessions.
 *
 * Two session kinds share one HMAC-SHA256 signed-cookie mechanism:
 *   "account" — Better Auth-compatible session reference (deferred: requires
 *               L02-owned auth tables + coordinator-approved dependency; the
 *               payload format and resolver contract are already stable so the
 *               swap is a backend change only).
 *   "demo"    — server-minted, expiring, limited guest session for the public
 *               hackathon demo. Grants read-only entry to the owned synthetic
 *               demo workspace ONLY. This is a real server-verified session,
 *               not a client-side mock.
 *
 * Wire format: base64url(JSON payload) "." base64url(HMAC-SHA256(payload)).
 * Everything security-relevant lives inside the signed payload; tampering
 * fails verification → session resolves to null → callers fail closed.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const ACCOUNT_COOKIE = "hc_session" as const;
export const DEMO_COOKIE = "hc_demo" as const;
export const MODE_COOKIE = "hc_mode" as const;

export const DEMO_SESSION_TTL_SECONDS = 3600 as const;
export const SESSION_PAYLOAD_VERSION = 1 as const;

/** The single workspace a demo session may ever touch (L02 deterministic seed). */
export const DEMO_WORKSPACE_ID = "a0a0a0a0-0000-4000-8000-000000000001" as const;
export const DEMO_PROJECT_ID = "a0a0a0a0-0000-4000-8000-000000000002" as const;
/** The only target alias a demo session may be scoped to — matches contracts TargetServiceAliasSchema. */
export const DEMO_TARGET_ALIAS = "target-lab" as const;
/** The only test pack a demo scan may run (bola-invoice pack, GET-only, synthetic). */
export const DEMO_PACK_ID = "bola-invoice-v1" as const;
/** The pre-approved demo scope row (L02 seed). Guests inherit it; they can never create scopes. */
export const DEMO_SCOPE_ID = "a0a0a0a0-0000-4000-8000-000000000008" as const;

export type ExperienceMode = "builder" | "developer";

export interface AccountSession {
  kind: "account";
  userId: string;
  sessionId: string;
  expiresAt: number;
}

export interface DemoSession {
  kind: "demo";
  /** Synthetic identity — `guest-<id>`, never a real user id. */
  userId: string;
  sessionId: string;
  expiresAt: number;
  /** Always DEMO_WORKSPACE_ID — the only workspace visible to guests. */
  workspaceId: typeof DEMO_WORKSPACE_ID;
  projectId: typeof DEMO_PROJECT_ID;
  targetAlias: typeof DEMO_TARGET_ALIAS;
}

export type HighCastleSession = AccountSession | DemoSession;

interface WirePayload {
  v: number;
  kind: "account" | "demo";
  uid: string;
  sid: string;
  iat: number;
  exp: number;
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

function sign(payloadB64: string, secret: string): string {
  return b64url(createHmac("sha256", secret).update(payloadB64).digest());
}

export function issueSessionCookieValue(
  session: HighCastleSession,
  secret: string,
  now = Date.now(),
): string {
  const payload: WirePayload = {
    v: SESSION_PAYLOAD_VERSION,
    kind: session.kind,
    uid: session.userId,
    sid: session.sessionId,
    iat: Math.floor(now / 1000),
    exp: Math.floor(session.expiresAt / 1000),
  };
  const payloadB64 = b64url(JSON.stringify(payload));
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

export function verifySessionCookieValue(
  cookieValue: string,
  expectedKind: "account" | "demo",
  secret: string,
  now = Date.now(),
): HighCastleSession | null {
  const dot = cookieValue.lastIndexOf(".");
  if (dot <= 0) return null;
  const payloadB64 = cookieValue.slice(0, dot);
  const sig = cookieValue.slice(dot + 1);
  const expected = sign(payloadB64, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: WirePayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as WirePayload;
  } catch {
    return null;
  }
  if (payload.v !== SESSION_PAYLOAD_VERSION || payload.kind !== expectedKind) return null;
  if (typeof payload.exp !== "number" || payload.exp * 1000 <= now) return null;

  if (payload.kind === "demo") {
    return {
      kind: "demo",
      userId: payload.uid,
      sessionId: payload.sid,
      expiresAt: payload.exp * 1000,
      workspaceId: DEMO_WORKSPACE_ID,
      projectId: DEMO_PROJECT_ID,
      targetAlias: DEMO_TARGET_ALIAS,
    };
  }
  return { kind: "account", userId: payload.uid, sessionId: payload.sid, expiresAt: payload.exp * 1000 };
}

export function newDemoSession(now = Date.now()): DemoSession {
  const sid = randomBytes(16).toString("base64url");
  return {
    kind: "demo",
    userId: `guest-${sid.slice(0, 8)}`,
    sessionId: sid,
    expiresAt: now + DEMO_SESSION_TTL_SECONDS * 1000,
    workspaceId: DEMO_WORKSPACE_ID,
    projectId: DEMO_PROJECT_ID,
    targetAlias: DEMO_TARGET_ALIAS,
  };
}

export function cookieHeader(
  name: string,
  value: string,
  opts: { maxAge?: number } = {},
): string {
  const parts = [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${opts.maxAge ?? DEMO_SESSION_TTL_SECONDS}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export function expiredCookieHeader(name: string): string {
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function readCookie(headers: Headers, name: string): string | null {
  const raw = headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}
