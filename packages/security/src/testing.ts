import {
  CONTRACT_SCHEMA_VERSION,
  type AuthorizationScope,
  type Environment,
  type EnvironmentId,
  type ModelProposal,
  type Project,
  type ProjectId,
  type Target,
  type TargetId,
  type UserId,
  type WorkspaceId,
  type AuthorizationScopeId,
} from "@highcastle/contracts";
import { computeScopeHash } from "./scope-hash.js";

/**
 * Deterministic test fixtures for the policy engine and its consumers
 * (L13 policy gateway, L14 sandbox, L18 BFF). All fixtures describe the ONE
 * legal H demo authorization: owned synthetic invoice lab, `bola-invoice-v1`,
 * GET-only. `makeDemoScope` always returns a scope whose `scopeHash` matches
 * its content — mutate it deliberately to test tamper detection.
 *
 * Not a runtime dependency of the engine — import via
 * `@highcastle/security/testing` in test code only.
 */

export const DEMO_NOW = new Date("2026-11-06T12:00:00.000Z");

export const DEMO_IDS = {
  workspaceId: "11111111-1111-4111-8111-111111111111" as WorkspaceId,
  projectId: "22222222-2222-4222-8222-222222222222" as ProjectId,
  targetId: "33333333-3333-4333-8333-333333333333" as TargetId,
  environmentId: "44444444-4444-4444-8444-444444444444" as EnvironmentId,
  userId: "55555555-5555-4555-8555-555555555555" as UserId,
  scopeId: "66666666-6666-4666-8666-666666666666" as AuthorizationScopeId,
} as const;

/** IDs outside the demo tenant — for cross-workspace denial tests. */
export const FOREIGN_IDS = {
  workspaceId: "99999999-9999-4999-8999-999999999999" as WorkspaceId,
  projectId: "99999999-9999-4999-8999-999999999998" as ProjectId,
  targetId: "99999999-9999-4999-8999-999999999997" as TargetId,
  environmentId: "99999999-9999-4999-8999-999999999996" as EnvironmentId,
} as const;

const FIELDS_DEFAULTS = {
  id: DEMO_IDS.scopeId,
  workspaceId: DEMO_IDS.workspaceId,
  projectId: DEMO_IDS.projectId,
  targetId: DEMO_IDS.targetId,
  version: 1,
  actorUserId: DEMO_IDS.userId,
  allowedHosts: ["target-lab"],
  allowedPaths: ["/api/invoices"],
  deniedPaths: ["/api/invoices/admin"],
  allowedTestPackIds: ["bola-invoice-v1"],
  allowedMethods: ["GET"],
  maxDurationSeconds: 60,
  maxRequests: 16,
  maxConcurrency: 1,
  maxMemoryMb: 256,
  networkProfileId: "lab-isolated-net",
  permittedEnvironmentId: DEMO_IDS.environmentId,
  approvedAt: "2026-11-06T11:00:00.000Z",
  expiresAt: "2026-11-06T13:00:00.000Z",
} satisfies Omit<AuthorizationScope, "status" | "scopeHash"> & {
  allowedTestPackIds: string[];
  allowedMethods: string[];
};

/**
 * Build a structurally valid, internally consistent scope. The `scopeHash`
 * is always computed over the merged fields — callers cannot accidentally
 * produce a mismatch; use `verifyScopeHash` after mutating fields to test
 * tamper detection.
 */
export function makeDemoScope(
  overrides: Partial<Omit<AuthorizationScope, "scopeHash">> = {},
): AuthorizationScope {
  const fields = {
    ...FIELDS_DEFAULTS,
    ...overrides,
  } as Omit<AuthorizationScope, "status" | "scopeHash"> & {
    status?: AuthorizationScope["status"];
  };
  const scopeHash = computeScopeHash(fields);
  return {
    ...fields,
    status: fields.status ?? "active",
    scopeHash,
  } as AuthorizationScope;
}

export function makeDemoProject(overrides: Partial<Project> = {}): Project {
  return {
    id: DEMO_IDS.projectId,
    workspaceId: DEMO_IDS.workspaceId,
    slug: "invoice-demo",
    name: "Invoice Demo",
    description: "Synthetic invoice lab",
    kind: "demo",
    lifecycle: "ready",
    createdBy: DEMO_IDS.userId,
    createdAt: "2026-11-06T10:00:00.000Z",
    updatedAt: "2026-11-06T10:00:00.000Z",
    archivedAt: null,
    ...overrides,
  };
}

export function makeDemoTarget(overrides: Partial<Target> = {}): Target {
  return {
    id: DEMO_IDS.targetId,
    workspaceId: DEMO_IDS.workspaceId,
    projectId: DEMO_IDS.projectId,
    environmentId: DEMO_IDS.environmentId,
    label: "Synthetic invoice lab",
    canonicalOrigin: "https://target-lab.internal",
    targetKind: "demo",
    state: "verified",
    verificationStatus: "synthetic_lab_attestation",
    verificationMethod: "synthetic_lab_attestation",
    verifiedBy: DEMO_IDS.userId,
    verifiedAt: "2026-11-06T10:30:00.000Z",
    verificationExpiresAt: null,
    ...overrides,
  };
}

export function makeDemoEnvironment(overrides: Partial<Environment> = {}): Environment {
  return {
    id: DEMO_IDS.environmentId,
    workspaceId: DEMO_IDS.workspaceId,
    projectId: DEMO_IDS.projectId,
    label: "Attack twin",
    kind: "attack_twin",
    currentRevision: "lab-v1-vulnerable@sha256:demo",
    fixtureVersion: "1.0.0",
    provisionStatus: "ready",
    networkProfileId: "lab-isolated-net",
    createdAt: "2026-11-06T10:00:00.000Z",
    destroyedAt: null,
    ...overrides,
  };
}

export function makeValidProposal(overrides: Partial<ModelProposal> = {}): ModelProposal {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    hypothesis: {
      category: "broken_object_authorization",
      targetComponent: "invoice_lookup",
      reason: "Ownership check may be absent on invoice reads",
      expectedSecureBehavior: "A customer cannot read another customer's invoice",
    },
    requestedTest: {
      packId: "bola-invoice-v1",
      objective: "Verify cross-account invoice reads are denied",
    },
    ...overrides,
  };
}
