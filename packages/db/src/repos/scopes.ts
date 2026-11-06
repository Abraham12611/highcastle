import { createHash } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import type { DbExecutor } from "../client.js";
import { authorizationScopes, environments, targets } from "../schema/tables.js";
import { DbError } from "../errors.js";

/**
 * Authorization-scope repository.
 *
 * Canonical serialization for `scope_hash` (owned by L04
 * `packages/security`; duplicated here only so the L02 seed can produce a
 * real hash before that package lands):
 * lowercase hex SHA-256 over `JSON.stringify` of the scope content with
 * lexicographically sorted keys and sorted string arrays. Any content change
 * yields a different hash; identical content yields the existing row.
 */
export function hashScopeContent(content: {
  allowedHosts: string[];
  allowedPaths: string[];
  deniedPaths: string[];
  allowedTestPackIds: string[];
  allowedMethods: string[];
  maxDurationSeconds: number;
  maxRequests: number;
  maxConcurrency: number;
  maxMemoryMb: number;
  maxCpuMillicores?: number | null;
  networkProfileId?: string | null;
  projectId: string;
  targetId: string;
  permittedEnvironmentId: string;
}): string {
  const canonical = JSON.stringify({
    allowedHosts: [...content.allowedHosts].sort(),
    allowedMethods: [...content.allowedMethods].sort(),
    allowedPaths: [...content.allowedPaths].sort(),
    allowedTestPackIds: [...content.allowedTestPackIds].sort(),
    deniedPaths: [...content.deniedPaths].sort(),
    maxConcurrency: content.maxConcurrency,
    maxCpuMillicores: content.maxCpuMillicores ?? null,
    maxDurationSeconds: content.maxDurationSeconds,
    maxMemoryMb: content.maxMemoryMb,
    maxRequests: content.maxRequests,
    networkProfileId: content.networkProfileId ?? null,
    permittedEnvironmentId: content.permittedEnvironmentId,
    projectId: content.projectId,
    targetId: content.targetId,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export interface CreateScopeInput {
  /** Optional deterministic ID (fixtures/seeds); random UUID otherwise. */
  id?: string;
  workspaceId: string;
  projectId: string;
  targetId: string;
  actorUserId: string;
  version?: number;
  allowedHosts: string[];
  allowedPaths: string[];
  deniedPaths?: string[];
  allowedTestPackIds: string[];
  allowedMethods: string[];
  maxDurationSeconds: number;
  maxRequests: number;
  maxConcurrency: number;
  maxMemoryMb: number;
  maxCpuMillicores?: number | null;
  networkProfileId?: string | null;
  permittedEnvironmentId: string;
  expiresAt: Date;
}

function toHashInput(input: CreateScopeInput) {
  return {
    allowedHosts: input.allowedHosts,
    allowedPaths: input.allowedPaths,
    deniedPaths: input.deniedPaths ?? [],
    allowedTestPackIds: input.allowedTestPackIds,
    allowedMethods: input.allowedMethods,
    maxDurationSeconds: input.maxDurationSeconds,
    maxRequests: input.maxRequests,
    maxConcurrency: input.maxConcurrency,
    maxMemoryMb: input.maxMemoryMb,
    maxCpuMillicores: input.maxCpuMillicores ?? null,
    networkProfileId: input.networkProfileId ?? null,
    projectId: input.projectId,
    targetId: input.targetId,
    permittedEnvironmentId: input.permittedEnvironmentId,
  };
}

/**
 * Insert an approved scope. Target and environment must belong to the same
 * workspace/project (verified join — a scope can never cross tenants).
 * Identical content returns the existing row (idempotent approval replay).
 */
export async function createAuthorizationScope(db: DbExecutor, input: CreateScopeInput) {
  const [target] = await db
    .select()
    .from(targets)
    .where(
      and(
        eq(targets.id, input.targetId),
        eq(targets.workspaceId, input.workspaceId),
        eq(targets.projectId, input.projectId),
      ),
    )
    .limit(1);
  if (!target) throw DbError.notFound("target", input.targetId);
  const [env] = await db
    .select()
    .from(environments)
    .where(
      and(
        eq(environments.id, input.permittedEnvironmentId),
        eq(environments.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!env) throw DbError.notFound("environment", input.permittedEnvironmentId);

  const scopeHash = hashScopeContent(toHashInput(input));
  const existing = await getScopeByHash(db, scopeHash);
  if (existing) return existing;

  const [row] = await db
    .insert(authorizationScopes)
    .values({
      id: input.id,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      targetId: input.targetId,
      version: input.version ?? 1,
      actorUserId: input.actorUserId,
      status: "active",
      allowedHosts: input.allowedHosts,
      allowedPaths: input.allowedPaths,
      deniedPaths: input.deniedPaths ?? [],
      allowedTestPackIds: input.allowedTestPackIds,
      allowedMethods: input.allowedMethods,
      maxDurationSeconds: input.maxDurationSeconds,
      maxRequests: input.maxRequests,
      maxConcurrency: input.maxConcurrency,
      maxMemoryMb: input.maxMemoryMb,
      maxCpuMillicores: input.maxCpuMillicores ?? null,
      networkProfileId: input.networkProfileId ?? null,
      permittedEnvironmentId: input.permittedEnvironmentId,
      expiresAt: input.expiresAt,
      scopeHash,
    })
    .returning();
  if (!row) throw new DbError("internal", "scope insert returned no row");
  return row;
}

export async function getScopeByHash(db: DbExecutor, scopeHash: string) {
  const rows = await db
    .select()
    .from(authorizationScopes)
    .where(eq(authorizationScopes.scopeHash, scopeHash))
    .limit(1);
  return rows[0] ?? null;
}

/** Tenant-scoped read. */
export async function getScope(db: DbExecutor, workspaceId: string, scopeId: string) {
  const rows = await db
    .select()
    .from(authorizationScopes)
    .where(
      and(eq(authorizationScopes.id, scopeId), eq(authorizationScopes.workspaceId, workspaceId)),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getActiveScopeForTarget(
  db: DbExecutor,
  workspaceId: string,
  targetId: string,
) {
  const rows = await db
    .select()
    .from(authorizationScopes)
    .where(
      and(
        eq(authorizationScopes.targetId, targetId),
        eq(authorizationScopes.workspaceId, workspaceId),
        eq(authorizationScopes.status, "active"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Terminal status transition (`active` → `revoked`). Content columns are
 * never touched and a revoked/expired scope can never be re-activated:
 * re-authorization inserts a new versioned row.
 */
export async function revokeAuthorizationScope(
  db: DbExecutor,
  workspaceId: string,
  scopeId: string,
) {
  const existing = await getScope(db, workspaceId, scopeId);
  if (!existing) throw DbError.notFound("authorization_scope", scopeId);
  if (existing.status !== "active") {
    throw DbError.conflict(`scope is already ${existing.status}; re-authorize with a new version`, {
      scopeId,
    });
  }
  const [row] = await db
    .update(authorizationScopes)
    .set({ status: "revoked" })
    .where(
      and(
        eq(authorizationScopes.id, scopeId),
        eq(authorizationScopes.workspaceId, workspaceId),
        eq(authorizationScopes.status, "active"),
      ),
    )
    .returning();
  if (!row) throw DbError.conflict("scope was modified concurrently", { scopeId });
  return row;
}

/** Janitor transition: expire every active scope past its `expires_at`. */
export async function expireAuthorizationScopes(
  db: DbExecutor,
  now: Date = new Date(),
): Promise<number> {
  const rows = await db
    .update(authorizationScopes)
    .set({ status: "expired" })
    .where(and(eq(authorizationScopes.status, "active"), lt(authorizationScopes.expiresAt, now)))
    .returning();
  return rows.length;
}
