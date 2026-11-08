import { and, eq, ne } from "drizzle-orm";
import type { DbExecutor } from "../client.js";
import { DbError } from "../errors.js";
import {
  githubRepoSources,
  githubSourceConnections,
  type SourceConnectionStatus,
} from "../schema/sources.js";

/** GitHub source connections (L13) — owner-scoped persistence. */

export interface CreateConnectionInput {
  ownerUserId: string;
  composioSessionId: string;
  authConfigId: string;
  workspaceId?: string | null;
}

export async function createSourceConnection(db: DbExecutor, input: CreateConnectionInput) {
  const [row] = await db
    .insert(githubSourceConnections)
    .values({
      ownerUserId: input.ownerUserId,
      composioSessionId: input.composioSessionId,
      authConfigId: input.authConfigId,
      workspaceId: input.workspaceId ?? null,
      status: "pending",
    })
    .returning();
  if (!row) throw new DbError("internal", "connection insert returned no row");
  return row;
}

/** Owner-scoped read — a connection is invisible to other users. */
export async function getSourceConnection(db: DbExecutor, ownerUserId: string, id: string) {
  const [row] = await db
    .select()
    .from(githubSourceConnections)
    .where(
      and(eq(githubSourceConnections.id, id), eq(githubSourceConnections.ownerUserId, ownerUserId)),
    )
    .limit(1);
  return row ?? null;
}

/** The owner's current live (non-disconnected) connection, if any. */
export async function getActiveSourceConnection(db: DbExecutor, ownerUserId: string) {
  const [row] = await db
    .select()
    .from(githubSourceConnections)
    .where(
      and(
        eq(githubSourceConnections.ownerUserId, ownerUserId),
        ne(githubSourceConnections.status, "disconnected"),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function updateSourceConnection(
  db: DbExecutor,
  id: string,
  patch: {
    status?: SourceConnectionStatus;
    composioConnectedAccountId?: string | null;
    githubLogin?: string | null;
    disconnectedAt?: Date | null;
  },
) {
  const [row] = await db
    .update(githubSourceConnections)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(githubSourceConnections.id, id))
    .returning();
  if (!row) throw new DbError("not_found", `source connection ${id}`);
  return row;
}

export interface RepoSourceInput {
  connectionId: string;
  ownerUserId: string;
  workspaceId?: string | null;
  repoId: string;
  fullName: string;
  defaultBranch: string;
  commitSha: string;
  repoMeta?: unknown;
}

/** Upsert the single active selection for a connection. */
export async function upsertRepoSource(db: DbExecutor, input: RepoSourceInput) {
  const [existing] = await db
    .select({ id: githubRepoSources.id })
    .from(githubRepoSources)
    .where(eq(githubRepoSources.connectionId, input.connectionId))
    .limit(1);

  if (existing) {
    const [row] = await db
      .update(githubRepoSources)
      .set({
        repoId: input.repoId,
        fullName: input.fullName,
        defaultBranch: input.defaultBranch,
        commitSha: input.commitSha,
        repoMeta: input.repoMeta ?? null,
        reconResult: null,
        reconAt: null,
        selectedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(githubRepoSources.id, existing.id))
      .returning();
    if (!row) throw new DbError("internal", "repo source update returned no row");
    return row;
  }

  const [row] = await db
    .insert(githubRepoSources)
    .values({
      connectionId: input.connectionId,
      ownerUserId: input.ownerUserId,
      workspaceId: input.workspaceId ?? null,
      repoId: input.repoId,
      fullName: input.fullName,
      defaultBranch: input.defaultBranch,
      commitSha: input.commitSha,
      repoMeta: input.repoMeta ?? null,
    })
    .returning();
  if (!row) throw new DbError("internal", "repo source insert returned no row");
  return row;
}

export async function getRepoSource(db: DbExecutor, ownerUserId: string, connectionId: string) {
  const [row] = await db
    .select()
    .from(githubRepoSources)
    .where(
      and(
        eq(githubRepoSources.connectionId, connectionId),
        eq(githubRepoSources.ownerUserId, ownerUserId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function saveReconResult(db: DbExecutor, repoSourceId: string, recon: unknown) {
  const [row] = await db
    .update(githubRepoSources)
    .set({ reconResult: recon ?? null, reconAt: new Date(), updatedAt: new Date() })
    .where(eq(githubRepoSources.id, repoSourceId))
    .returning();
  if (!row) throw new DbError("not_found", `repo source ${repoSourceId}`);
  return row;
}
