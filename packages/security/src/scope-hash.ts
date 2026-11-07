import { createHash, timingSafeEqual } from "node:crypto";
import type { AuthorizationScope, ScopeHash } from "@highcastle/contracts";

/**
 * Immutable authorization-scope hashing — THE canonical scope hash.
 *
 * This is the single hash function for the whole platform (coordinator /
 * L02 alignment): `packages/db` persists `scope_hash` at insert time and
 * performs idempotent-replay dedupe on it; this module re-verifies it at
 * every policy evaluation. L02's `CreateScopeInput` maps 1:1 onto
 * `ScopeHashFields` — callers pass plain field bags, DB rows or parsed
 * `AuthorizationScope`s and get the byte-identical digest.
 *
 * Canonical content (v1) — every authority-bearing grant field:
 *   actorUserId, allowedHosts, allowedMethods, allowedPaths,
 *   allowedTestPackIds, deniedPaths, expiresAt, maxConcurrency,
 *   maxDurationSeconds, maxMemoryMb, maxRequests, networkProfileId,
 *   permittedEnvironmentId, projectId, targetId, version, workspaceId.
 *
 * Excluded, deliberately:
 * - `id` — row identity, generated at insert; hashing it would break
 *   idempotent replay (identical grant content must yield the same row).
 * - `status` — mutable lifecycle; revocation/expiry are enforced by
 *   `checkScopeStatus`, so a revoked scope still verifies against its
 *   snapshot and denies for the RIGHT reason.
 * - `approvedAt` — DB-set timestamp, unavailable at insert time; the
 *   approval instant is audit data, not grant content.
 * - `scopeHash` — self-referential.
 * - Any non-contract extension columns (e.g. `maxCpuMillicores`): the
 *   hash covers exactly the contract grant so a contract-parsed scope
 *   always recomputes the persisted digest.
 *
 * Normalization:
 * - Hostnames lowercased; every allow/deny list sorted and de-duplicated
 *   (identical authority ⇒ identical hash).
 * - `expiresAt` normalized to UTC ISO-8601 via `Date.toISOString()` so a
 *   `Date` object and an ISO string hash identically.
 * - Payload prefixed with the algorithm version tag; bumping
 *   `SCOPE_HASH_VERSION` changes every digest loudly instead of colliding.
 * - Object keys emitted in sorted order; output is lowercase hex SHA-256.
 */

export const SCOPE_HASH_VERSION = "scope-hash-v1" as const;

/** Structural input — accepts plain field bags AND branded contract rows. */
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

/** Backwards-compatible alias for the canonical input type. */
export type ScopeHashInput = ScopeHashFields &
  Partial<Pick<AuthorizationScope, "status" | "scopeHash" | "id" | "approvedAt">>;

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
 * THE canonical scope hash — the only function that may produce a
 * `scopeHash`. DB persistence, seed fixtures and policy verification all
 * call this (or `verifyScopeHash`); no other serialization is permitted.
 */
export function computeScopeHash(scope: ScopeHashFields): ScopeHash {
  const canonical = `${SCOPE_HASH_VERSION}:${stableStringify(canonicalizeScope(scope))}`;
  return createHash("sha256").update(canonical, "utf8").digest("hex") as ScopeHash;
}

/**
 * Constant-time comparison of a stored scope's `scopeHash` against a fresh
 * computation. Returns false when the scope content was mutated post-approval
 * or when the stored hash is malformed (fail closed).
 */
export function verifyScopeHash(scope: AuthorizationScope): boolean {
  if (!/^[0-9a-f]{64}$/.test(scope.scopeHash)) {
    return false;
  }
  const expected = computeScopeHash(scope);
  const a = Buffer.from(scope.scopeHash, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
