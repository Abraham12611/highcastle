import { and, eq } from "drizzle-orm";
import type { Database, DbExecutor } from "../client.js";
import { workspaceMembers, workspaces } from "../schema/tables.js";
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
