import { and, asc, eq } from "drizzle-orm";
import type { Database, DbExecutor } from "../client.js";
import { userPreferences, workspaceMembers, workspaces } from "../schema/tables.js";
import { DbError } from "../errors.js";

export interface CreateWorkspaceInput {
  /** Optional deterministic ID (fixtures/seeds); random UUID otherwise. */
  id?: string;
  slug: string;
  name: string;
  ownerUserId: string;
}

/** Create a workspace and its owner membership atomically. */
export async function createWorkspace(db: Database, input: CreateWorkspaceInput) {
  return db.transaction(async (tx) => {
    const [workspace] = await tx
      .insert(workspaces)
      .values({
        id: input.id,
        slug: input.slug,
        name: input.name,
        ownerUserId: input.ownerUserId,
      })
      .returning();
    if (!workspace) throw new DbError("internal", "workspace insert returned no row");
    await tx.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: input.ownerUserId,
      role: "owner",
    });
    return workspace;
  });
}

export async function getWorkspace(db: DbExecutor, workspaceId: string) {
  const rows = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  return rows[0] ?? null;
}

export async function getWorkspaceBySlug(db: DbExecutor, slug: string) {
  const rows = await db.select().from(workspaces).where(eq(workspaces.slug, slug)).limit(1);
  return rows[0] ?? null;
}

/** Tenant-status switch (e.g. operator emergency stop suspends a workspace). */
export async function setWorkspaceStatus(db: DbExecutor, workspaceId: string, status: string) {
  const [row] = await db
    .update(workspaces)
    .set({ status, updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId))
    .returning();
  if (!row) throw DbError.notFound("workspace", workspaceId);
  return row;
}

export async function addWorkspaceMember(
  db: DbExecutor,
  input: { workspaceId: string; userId: string; role: "owner" | "admin" | "developer" | "viewer" },
) {
  const [workspace] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, input.workspaceId))
    .limit(1);
  if (!workspace) throw DbError.notFound("workspace", input.workspaceId);
  const [member] = await db
    .insert(workspaceMembers)
    .values({
      workspaceId: input.workspaceId,
      userId: input.userId,
      role: input.role,
    })
    .onConflictDoNothing()
    .returning();
  if (!member) {
    const existing = await getWorkspaceMember(db, input.workspaceId, input.userId);
    if (!existing) throw DbError.conflict("membership insert produced no row");
    return existing;
  }
  return member;
}

export async function getWorkspaceMember(db: DbExecutor, workspaceId: string, userId: string) {
  const rows = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listWorkspaceMembers(db: DbExecutor, workspaceId: string) {
  return db.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId));
}

export async function removeWorkspaceMember(db: DbExecutor, workspaceId: string, userId: string) {
  const [row] = await db
    .delete(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .returning();
  if (!row) throw DbError.notFound("workspace_member", userId);
  return row;
}

// --- User → workspaces (account tenancy; issue #72 / E12) ---

export interface UserWorkspaceMembership {
  workspace: typeof workspaces.$inferSelect;
  role: "owner" | "admin" | "developer" | "viewer";
  joinedAt: Date;
}

/**
 * Tenant-authorized user→workspace listing: every workspace the user holds
 * a membership row for, oldest membership first (stable "primary" = [0]).
 * This is the ONLY supported account workspace discovery — no session claim
 * or client hint ever substitutes for a membership row.
 */
export async function listUserWorkspaces(
  db: DbExecutor,
  userId: string,
): Promise<UserWorkspaceMembership[]> {
  const rows = await db
    .select({ workspace: workspaces, member: workspaceMembers })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(asc(workspaceMembers.joinedAt), asc(workspaces.createdAt));
  return rows.map((row) => ({
    workspace: row.workspace,
    role: row.member.role,
    joinedAt: row.member.joinedAt,
  }));
}

/**
 * Deterministic per-account slug for the auto-provisioned first workspace.
 * Doubles as the provisioning tombstone: when the derived workspace exists
 * but the user has no membership, access was provisioned once and later
 * revoked — `ensureAccountWorkspace` must NOT silently resurrect it.
 */
export function accountWorkspaceSlug(userId: string): string {
  return `u-${userId}`;
}

export interface EnsureAccountWorkspaceResult {
  /** Authoritative membership list after the call (may be empty). */
  memberships: UserWorkspaceMembership[];
  /** True only when THIS call inserted the first workspace. */
  created: boolean;
}

/**
 * Idempotent first-workspace provisioning transaction (issue #72).
 *
 * Safe to invoke on every authenticated account request:
 * - first call inserts workspace + owner membership + default preferences in
 *   one transaction and returns `created: true`;
 * - later calls (repeated login, retries) return the existing membership
 *   list untouched;
 * - concurrent calls for the same user converge on the unique slug and the
 *   membership primary key — both writers land on identical rows, no
 *   duplicate workspace is ever committed;
 * - a user whose memberships were revoked gets `[]` back forever: the
 *   derived-slug tombstone blocks silent re-provisioning.
 */
export async function ensureAccountWorkspace(
  db: Database,
  input: { userId: string; name?: string },
): Promise<EnsureAccountWorkspaceResult> {
  return db.transaction(async (tx) => {
    const existing = await listUserWorkspaces(tx, input.userId);
    if (existing.length > 0) return { memberships: existing, created: false };

    const slug = accountWorkspaceSlug(input.userId);
    const prior = await tx
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.slug, slug))
      .limit(1);
    if (prior[0]) return { memberships: [], created: false };

    const [inserted] = await tx
      .insert(workspaces)
      .values({
        slug,
        name: input.name ?? "Personal workspace",
        ownerUserId: input.userId,
      })
      .onConflictDoNothing({ target: workspaces.slug })
      .returning();
    const ws =
      inserted ?? (await tx.select().from(workspaces).where(eq(workspaces.slug, slug)).limit(1))[0];
    if (!ws) throw new DbError("internal", "account workspace insert produced no row");
    await tx
      .insert(workspaceMembers)
      .values({ workspaceId: ws.id, userId: input.userId, role: "owner" })
      .onConflictDoNothing();
    await tx.insert(userPreferences).values({ userId: input.userId }).onConflictDoNothing();
    const memberships = await listUserWorkspaces(tx, input.userId);
    return { memberships, created: inserted !== undefined };
  });
}

// --- User preferences (per-account experience mode; issue #72) ---

export async function getUserPreferences(db: DbExecutor, userId: string) {
  const rows = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

/** Upsert the persisted experience mode; creates the row on first write. */
export async function setExperienceMode(
  db: DbExecutor,
  userId: string,
  experienceMode: "builder" | "developer",
) {
  const [row] = await db
    .insert(userPreferences)
    .values({ userId, experienceMode })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { experienceMode },
    })
    .returning();
  if (!row) throw new DbError("internal", "preferences upsert produced no row");
  return row;
}
