import { createHash, timingSafeEqual } from "node:crypto";
import type { AuthorizationScope, ScopeHash } from "@highcastle/contracts";

/**
 * Immutable authorization-scope hashing.
 *
 * `scopeHash` is the tamper-evident fingerprint recorded on every scan,
 * attempt, proposal decision and audit event. Anyone holding a scope row can
 * recompute it to prove the scope was not widened after approval (replay
 * attack: approving a narrow scope then mutating `allowedHosts`/`maxRequests`
 * in the DB would change the hash and fail closed at claim time).
 *
 * Canonicalization rules — all deterministic and order-independent:
 * - The hash covers every authority-bearing field: ids, approval/expiration,
 *   allowed hosts/paths/packs/methods, all four budget numbers, network
 *   profile and scope `version`.
 * - `status` is EXCLUDED: it is mutable lifecycle, not authorized content.
 *   Revocation/expiry are enforced by `checkScopeStatus`, not by the hash;
 *   excluding it lets a revoked scope still verify against its snapshot.
 * - `scopeHash` is EXCLUDED (self-referential).
 * - Hostnames are lowercased; all allow/deny lists are sorted and
 *   de-duplicated — `{GET}` and `{GET,GET}`, and reordered host lists, hash
 *   identically because they authorize identically.
 * - Object keys are emitted in sorted order; output is lowercase hex SHA-256.
 */

type ScopeWithOptionalLifecycle = Omit<AuthorizationScope, "status" | "scopeHash"> &
  Partial<Pick<AuthorizationScope, "status" | "scopeHash">>;

export type ScopeHashInput = ScopeWithOptionalLifecycle;

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

/** The exact object serialized for hashing. Exported for audit/debugging. */
export function canonicalizeScope(scope: ScopeHashInput): Record<string, unknown> {
  return {
    actorUserId: scope.actorUserId,
    allowedHosts: sortedUnique(scope.allowedHosts.map((h) => h.toLowerCase())),
    allowedMethods: sortedUnique(scope.allowedMethods),
    allowedPaths: sortedUnique(scope.allowedPaths),
    allowedTestPackIds: sortedUnique(scope.allowedTestPackIds),
    approvedAt: scope.approvedAt,
    deniedPaths: sortedUnique(scope.deniedPaths),
    expiresAt: scope.expiresAt,
    id: scope.id,
    maxConcurrency: scope.maxConcurrency,
    maxDurationSeconds: scope.maxDurationSeconds,
    maxMemoryMb: scope.maxMemoryMb,
    maxRequests: scope.maxRequests,
    networkProfileId: scope.networkProfileId,
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

export function computeScopeHash(scope: ScopeHashInput): ScopeHash {
  return createHash("sha256")
    .update(stableStringify(canonicalizeScope(scope)), "utf8")
    .digest("hex") as ScopeHash;
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
