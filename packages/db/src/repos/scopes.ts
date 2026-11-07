import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import type { DbExecutor } from "../client.js";
import { authorizationScopes, environments, projects, targets } from "../schema/tables.js";
import { DbError } from "../errors.js";

/**
 * Canonical scope hash — byte-identical mirror of `@highcastle/security`
 * `computeScopeHash` (`scope-hash-v1`).
 *
 * The canonical implementation lives in L04 (`packages/security/src/
 * scope-hash.ts`); this module ports it verbatim because `@highcastle/
 * security` is not yet merged to `develop` and this package cannot depend
 * on an unmerged lane. Once L04 lands, this file must delegate to it instead
 * (tracked in the PR body). Equivalence is proven by
 * `src/scope-hash.test.ts`, which pins a digest produced by L04's actual
 * code plus tamper/status/vector semantics from L04's own test suite.
 *
 * Algorithm: lowercase hex SHA-256 over `"scope-hash-v1:" + stableStringify
 * (canonicalizeScope(fields))`. Covered: every authority-bearing grant field
 * (actor, hosts/paths/packs/methods, budgets, network profile, environment/
 * project/target/workspace ids, version, expiry). Deliberately excluded: row
 * `id` (identical grants must dedupe), `status` (mutable lifecycle —
 * revocation is enforced separately so a revoked scope still verifies),
 * `approvedAt` (DB-set instant, unavailable at hash time), `scopeHash`
 * (self-referential), and non-contract extension columns such as this
 * package's `max_cpu_millicores` storage column.
 */
export const SCOPE_HASH_VERSION = "scope-hash-v1" as const;

/** Structural hash input — `CreateScopeInput` maps 1:1 onto this. */
export interface ScopeHashFields {
  actorUserId: string;
  allowedHosts: readonly string[];
  allowedMethods: readonly string[];
  allowedPaths: readonly string[];
  allowedTestPackIds: readonly string[];
  deniedPaths: readonly string[];
  expiresAt: string | Date;
  maxConcurrency: number;
  maxDurationSeconds: number;
  maxMemoryMb: number;
  maxRequests: number;
  networkProfileId: string | null | undefined;
  permittedEnvironmentId: string;
  projectId: string;
  targetId: string;
  version: number;
  workspaceId: string;
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function canonicalTimestamp(value: string | Date): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new RangeError(`expiresAt is not a parseable timestamp: ${JSON.stringify(value)}`);
  }
  return parsed.toISOString();
}

/** The exact object serialized for hashing. Exported for audit/debugging. */
export function canonicalizeScope(scope: ScopeHashFields): Record<string, unknown> {
  return {
    actorUserId: scope.actorUserId,
    allowedHosts: sortedUnique(scope.allowedHosts.map((h) => h.toLowerCase())),
    allowedMethods: sortedUnique(scope.allowedMethods),
    allowedPaths: sortedUnique(scope.allowedPaths),
    allowedTestPackIds: sortedUnique(scope.allowedTestPackIds),
    deniedPaths: sortedUnique(scope.deniedPaths),
    expiresAt: canonicalTimestamp(scope.expiresAt),
    maxConcurrency: scope.maxConcurrency,
    maxDurationSeconds: scope.maxDurationSeconds,
    maxMemoryMb: scope.maxMemoryMb,
    maxRequests: scope.maxRequests,
    networkProfileId: scope.networkProfileId ?? null,
    permittedEnvironmentId: scope.permittedEnvironmentId,
    projectId: scope.projectId,
    targetId: scope.targetId,
    version: scope.version,
    workspaceId: scope.workspaceId,
  };
}

/** Deterministic JSON: object keys sorted recursively, arrays kept as given. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const entries = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`);
  return `{${entries.join(",")}}`;
}

/**
 * Backwards-compatible input: structural grant fields plus optional ignored
 * lifecycle/identity fields (`status`, `scopeHash`, `id`, `approvedAt`) so a
 * full persisted row or contract scope hashes identically to its grant.
 */
export type ScopeHashInput = ScopeHashFields &
  Partial<{
    status: string;
    scopeHash: string;
    id: string;
    approvedAt: string | Date;
  }>;

/** THE canonical scope hash — the only function that may produce `scopeHash`. */
export function computeScopeHash(scope: ScopeHashInput): string {
  const canonical = `${SCOPE_HASH_VERSION}:${stableStringify(canonicalizeScope(scope))}`;
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/** Wire shape `verifyScopeHash` accepts (contract `AuthorizationScope`). */
export interface VerifiableScope extends ScopeHashFields {
  status: string;
  scopeHash: string;
  approvedAt: string | Date;
}

/**
 * Map a persisted scope row to the verifiable wire shape (timestamptz `Date`
 * values become UTC ISO strings, exactly as the API layer serializes them).
 */
export function toVerifiableScope(row: {
  id: string;
  workspaceId: string;
  projectId: string;
  targetId: string;
  version: number;
  actorUserId: string;
  status: string;
  allowedHosts: string[];
  allowedPaths: string[];
  deniedPaths: string[];
  allowedTestPackIds: string[];
  allowedMethods: string[];
  maxDurationSeconds: number;
  maxRequests: number;
  maxConcurrency: number;
  maxMemoryMb: number;
  networkProfileId: string | null;
  permittedEnvironmentId: string;
  approvedAt: Date;
  expiresAt: Date;
  scopeHash: string;
}): VerifiableScope {
  return {
    actorUserId: row.actorUserId,
    allowedHosts: row.allowedHosts,
    allowedMethods: row.allowedMethods,
    allowedPaths: row.allowedPaths,
    allowedTestPackIds: row.allowedTestPackIds,
    deniedPaths: row.deniedPaths,
    expiresAt: row.expiresAt instanceof Date ? row.expiresAt.toISOString() : row.expiresAt,
    maxConcurrency: row.maxConcurrency,
    maxDurationSeconds: row.maxDurationSeconds,
    maxMemoryMb: row.maxMemoryMb,
    maxRequests: row.maxRequests,
    networkProfileId: row.networkProfileId,
    permittedEnvironmentId: row.permittedEnvironmentId,
    projectId: row.projectId,
    targetId: row.targetId,
    version: row.version,
    workspaceId: row.workspaceId,
    status: row.status,
    approvedAt: row.approvedAt instanceof Date ? row.approvedAt.toISOString() : row.approvedAt,
    scopeHash: row.scopeHash,
  };
}

/**
 * Constant-time verification of a persisted scope against a fresh canonical
 * computation. False when content was mutated post-approval or the stored
 * hash is malformed (fail closed). Mirrors L04 `verifyScopeHash`, including
 * its lifecycle rule: a revoked scope still verifies (revocation is
 * enforced by status checks, so it denies for the RIGHT reason).
 */
export function verifyScopeHash(scope: VerifiableScope): boolean {
  if (!/^[0-9a-f]{64}$/.test(scope.scopeHash)) {
    return false;
  }
  const expected = computeScopeHash(scope);
  const a = Buffer.from(scope.scopeHash, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface CreateScopeInput {
  /** Optional deterministic ID (fixtures/seeds); random UUID otherwise. */
  id?: string;
  /**
   * Optional deterministic approval instant (seeds); `now` otherwise.
   * Excluded from the canonical hash (audit data, not grant content).
   */
  approvedAt?: Date;
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

/**
 * Structural hash input for a creation request. `CreateScopeInput` maps 1:1
 * onto `ScopeHashFields` (L04 contract): `id`/`approvedAt` are row/audit
 * data, never grant content, so identical grants dedupe to one row.
 */
function scopeHashFieldsFromInput(input: CreateScopeInput): ScopeHashFields {
  return {
    actorUserId: input.actorUserId,
    allowedHosts: input.allowedHosts,
    allowedMethods: input.allowedMethods,
    allowedPaths: input.allowedPaths,
    allowedTestPackIds: input.allowedTestPackIds,
    deniedPaths: input.deniedPaths ?? [],
    expiresAt: input.expiresAt,
    maxConcurrency: input.maxConcurrency,
    maxDurationSeconds: input.maxDurationSeconds,
    maxMemoryMb: input.maxMemoryMb,
    maxRequests: input.maxRequests,
    networkProfileId: input.networkProfileId ?? null,
    permittedEnvironmentId: input.permittedEnvironmentId,
    projectId: input.projectId,
    targetId: input.targetId,
    version: input.version ?? 1,
    workspaceId: input.workspaceId,
  };
}

/**
 * Insert an approved scope.
 *
 * Cross-entity ownership (mirrors L04 `checkScopeRelations` at persistence
 * time, so a scope can never cross tenants or authorize the wrong objects):
 * - project exists in this workspace and is not archived/paused;
 * - target belongs to the same workspace + project, is `verified`, and its
 *   verification is unexpired;
 * - environment belongs to the same workspace + project (ownership join).
 * Identical grant content returns the existing row (idempotent approval
 * replay — `id`/`approvedAt` are excluded from the canonical hash).
 */
export async function createAuthorizationScope(db: DbExecutor, input: CreateScopeInput) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, input.projectId), eq(projects.workspaceId, input.workspaceId)))
    .limit(1);
  if (!project) throw DbError.notFound("project", input.projectId);
  if (project.lifecycle === "archived" || project.lifecycle === "paused") {
    throw new DbError(
      "scope_denied",
      `project lifecycle ${project.lifecycle} does not permit execution`,
      {
        projectId: input.projectId,
      },
    );
  }
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
  if (target.state !== "verified") {
    throw new DbError("scope_denied", `target state ${target.state} is not verified`, {
      targetId: input.targetId,
    });
  }
  if (
    target.verificationExpiresAt !== null &&
    target.verificationExpiresAt.getTime() <= Date.now()
  ) {
    throw new DbError("scope_denied", "target verification has expired", {
      targetId: input.targetId,
    });
  }
  const [env] = await db
    .select()
    .from(environments)
    .where(
      and(
        eq(environments.id, input.permittedEnvironmentId),
        eq(environments.workspaceId, input.workspaceId),
        eq(environments.projectId, input.projectId),
      ),
    )
    .limit(1);
  if (!env) throw DbError.notFound("environment", input.permittedEnvironmentId);

  const scopeHash = computeScopeHash(scopeHashFieldsFromInput(input));
  const existing = await getScopeByHash(db, scopeHash);
  if (existing) return existing;

  const [row] = await db
    .insert(authorizationScopes)
    .values({
      id: input.id ?? randomUUID(),
      approvedAt: input.approvedAt ?? new Date(),
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
