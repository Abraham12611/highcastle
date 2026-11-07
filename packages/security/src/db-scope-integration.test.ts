import { describe, expect, it } from "vitest";
import { AuthorizationScopeSchema, type AuthorizationScope } from "@highcastle/contracts";
import { computeScopeHash, verifyScopeHash } from "./scope-hash.js";
import { evaluatePlanAuthorization, evaluateRequestAuthorization } from "./policy.js";
import {
  DEMO_IDS,
  DEMO_NOW,
  makeDemoEnvironment,
  makeDemoProject,
  makeDemoTarget,
  makeValidProposal,
} from "./testing.js";

/**
 * Integration test: a scope persisted through the DB creation path must
 * verify and authorize under the policy engine. This simulates L02's
 * `createAuthorizationScope` (`packages/db/src/repos/scopes.ts`):
 * a `CreateScopeInput` field bag — plain unbranded strings, `Date` expiry —
 * hashed by THE canonical `computeScopeHash`, then materialized as the
 * persisted row the DB returns (id, status, approvedAt, scopeHash).
 *
 * One canonical hash, two call sites: `packages/db` computes it at insert;
 * `@highcastle/security` re-computes it at every policy evaluation.
 */

/** Mirrors L02's CreateScopeInput shape (plain strings, Date expiry). */
function createScopeInput(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: DEMO_IDS.workspaceId as string,
    projectId: DEMO_IDS.projectId as string,
    targetId: DEMO_IDS.targetId as string,
    actorUserId: DEMO_IDS.userId as string,
    version: 1,
    allowedHosts: ["target-lab"],
    allowedPaths: ["/api/invoices"],
    deniedPaths: ["/api/invoices/admin"],
    allowedTestPackIds: ["bola-invoice-v1"],
    allowedMethods: ["GET"],
    maxDurationSeconds: 60,
    maxRequests: 16,
    maxConcurrency: 1,
    maxMemoryMb: 256,
    maxCpuMillicores: 500, // L02 extension column — NOT part of the canonical grant
    networkProfileId: "lab-isolated-net",
    permittedEnvironmentId: DEMO_IDS.environmentId as string,
    expiresAt: new Date("2026-11-06T13:00:00.000Z"),
    ...overrides,
  };
}

/** What the DB returns after insert (row materialization). */
function persistedRow(input: ReturnType<typeof createScopeInput>): AuthorizationScope {
  return AuthorizationScopeSchema.parse({
    id: DEMO_IDS.scopeId,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    targetId: input.targetId,
    version: input.version,
    actorUserId: input.actorUserId,
    status: "active",
    allowedHosts: input.allowedHosts,
    allowedPaths: input.allowedPaths,
    deniedPaths: input.deniedPaths,
    allowedTestPackIds: input.allowedTestPackIds,
    allowedMethods: input.allowedMethods,
    maxDurationSeconds: input.maxDurationSeconds,
    maxRequests: input.maxRequests,
    maxConcurrency: input.maxConcurrency,
    maxMemoryMb: input.maxMemoryMb,
    networkProfileId: input.networkProfileId,
    permittedEnvironmentId: input.permittedEnvironmentId,
    approvedAt: "2026-11-06T11:00:00.000Z", // DB defaultNow()
    expiresAt: input.expiresAt.toISOString(),
    scopeHash: computeScopeHash(input),
  });
}

function decision(d: ReturnType<typeof evaluatePlanAuthorization>) {
  return d.decision === "deny" ? d.reasons.map((r) => r.code) : [];
}

describe("DB-created scope → policy engine (canonical hash contract)", () => {
  it("a scope hashed and persisted by the DB path verifies", () => {
    const scope = persistedRow(createScopeInput());
    expect(verifyScopeHash(scope)).toBe(true);
  });

  it("the same DB-created scope is authorized end-to-end", () => {
    const scope = persistedRow(createScopeInput());
    const decision = evaluatePlanAuthorization({
      scope,
      project: makeDemoProject(),
      target: makeDemoTarget(),
      environment: makeDemoEnvironment(),
      proposal: makeValidProposal(),
      now: DEMO_NOW,
    });
    expect(decision.decision).toBe("allow");
    if (decision.decision !== "allow") return;
    expect(decision.policyHash).toBe(scope.scopeHash);
    if (decision.approval.kind !== "execution") return;
    expect(decision.approval.targetServiceAlias).toBe("target-lab");
    expect(decision.approval.setupOperations).toContainEqual({
      method: "POST",
      path: "/api/auth/login",
    });
  });

  it("idempotent replay: identical grant content yields the identical hash", () => {
    const a = persistedRow(createScopeInput());
    const b = persistedRow(createScopeInput());
    expect(a.scopeHash).toBe(b.scopeHash);
    expect(verifyScopeHash(b)).toBe(true);
  });

  it("rejects a scope whose persisted content was mutated post-approval", () => {
    const scope = persistedRow(createScopeInput());
    const tampered = { ...scope, allowedHosts: ["target-lab", "evil.example.com"] };
    expect(verifyScopeHash(tampered)).toBe(false);
    const d = evaluatePlanAuthorization({
      scope: tampered,
      project: makeDemoProject(),
      target: makeDemoTarget(),
      environment: makeDemoEnvironment(),
      proposal: makeValidProposal(),
      now: DEMO_NOW,
    });
    expect(decision(d)).toEqual(["scope_hash_mismatch"]);
  });

  it("rejects a DB scope persisted with an already-past expiry", () => {
    const scope = persistedRow(
      createScopeInput({ expiresAt: new Date("2026-11-06T11:00:00.000Z") }),
    );
    const d = evaluatePlanAuthorization({
      scope,
      project: makeDemoProject(),
      target: makeDemoTarget(),
      environment: makeDemoEnvironment(),
      proposal: makeValidProposal(),
      now: DEMO_NOW,
    });
    expect(decision(d)).toContain("scope_expired");
  });

  it("rejects a revoked DB scope", () => {
    const scope = persistedRow(createScopeInput());
    const revoked = { ...scope, status: "revoked" as const };
    // hash still verifies — revocation is lifecycle, enforced separately
    expect(verifyScopeHash(revoked)).toBe(true);
    const d = evaluateRequestAuthorization({
      scope: revoked,
      packId: "bola-invoice-v1",
      method: "GET",
      path: "/api/invoices/inv_A",
      now: DEMO_NOW,
    });
    expect(d.decision).toBe("deny");
    if (d.decision === "deny") {
      expect(d.reasons.map((r) => r.code)).toContain("scope_revoked");
    }
  });
});
