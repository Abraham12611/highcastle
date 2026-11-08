/**
 * Clerk user id → internal identity/workspace mapping (L05).
 *
 * The internal `userId` consumed by `AccountSession` + `workspace_members`
 * is a deterministic UUID derived from the stable Clerk subject. Same Clerk
 * user ⇒ same internal id, forever — no extra table needed until L02's auth
 * tables land (documented replacement: look up `users.clerk_user_id` once
 * the column exists; the derivation stays as seed fallback).
 *
 * Tenant isolation itself is enforced downstream by `authorize.ts` +
 * `workspace_members` — a mapping alone never grants access; without a real
 * membership row, account actions fail CLOSED.
 *
 * Workspace listing + first-login provisioning live in the E12 canonical
 * implementation (`listUserWorkspaces` / `ensureAccountWorkspace` in
 * `@highcastle/db`, wired by `server/me.ts`) — do not re-introduce a second
 * provisioning path here (coordinator order, issue #72).
 */

import { createHash } from "node:crypto";

const HC_NS = "hc:clerk-user:";

/** Deterministic UUIDv5-style mapping (SHA-256, RFC-4122 shaped). */
export function internalUserIdForClerk(clerkUserId: string): string {
  const h = createHash("sha256")
    .update(HC_NS + clerkUserId, "utf8")
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${(
    (parseInt(h.slice(16, 18), 16) & 0x3f) |
    0x80
  ).toString(16)}${h.slice(18, 20)}-${h.slice(20, 32)}`;
}
