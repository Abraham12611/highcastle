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
 * Provisioning (first-workspace bootstrap) is owned by Engineer 12's
 * transactional implementation — this module intentionally provides ONLY
 * identity mapping + membership reads; no competing bootstrap here.
 */

import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { workspaceMembers, workspaces, type DbExecutor } from "@highcastle/db";

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

export interface UserWorkspace {
  id: string;
  slug: string;
  name: string;
  role: string;
}

/**
 * User → workspace listing (tenant discovery). Returns every workspace the
 * internal user is a member of — the ONLY mechanism by which an account
 * learns its workspaces. No memberships ⇒ empty; never defaults to the
 * demo tenant.
 */
export async function listUserWorkspaces(
  db: DbExecutor,
  internalUserId: string,
): Promise<UserWorkspace[]> {
  const rows = await db
    .select({
      id: workspaces.id,
      slug: workspaces.slug,
      name: workspaces.name,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, internalUserId));
  return rows.map((r) => ({ id: r.id, slug: r.slug, name: r.name, role: r.role }));
}
