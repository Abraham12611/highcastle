import type { Database } from "./client.js";
import { getEnvironment, getProject, getTarget } from "./repos/projects.js";
import {
  createEnvironment,
  createProject,
  createTarget,
  createTestIdentity,
  listTestIdentities,
  verifyTarget,
} from "./repos/projects.js";
import { createAuthorizationScope, getScope } from "./repos/scopes.js";
import { addWorkspaceMember, createWorkspace, getWorkspaceBySlug } from "./repos/workspaces.js";
import { recordAuditEvent } from "./repos/audit.js";

/**
 * Deterministic HighCastle demo seed.
 *
 * Fixed UUIDs and re-runnable: every step checks for the existing row
 * first, so seeding twice is a no-op (no duplicate workspaces, projects or
 * scopes). Synthetic fixtures only — Alice owns `tenant_A`/`invoice_A`,
 * Bob owns `tenant_B`/`invoice_B`; no production PII, no real credentials.
 * The invoice SaaS rows themselves live in the target-lab (L11); this seed
 * holds the HighCastle-side tenant/project/scope records that point at it.
 *
 * Lab alignment (L11 contract, `apps/target-lab`):
 * - revisions are exactly `lab-v1-vulnerable` (attack twin) and
 *   `lab-v2-patched` (patched twin); fixture set `alice-bob-invoices@1.0.0`;
 * - the only scope-legal execution alias is `target-lab`, so the locked
 *   scope allows host `target-lab` and the target origin is
 *   `https://target-lab.internal` (L04 policy resolves the alias to the
 *   pinned image at execution time — the hostname never leaves the lab net);
 * - credential refs are opaque handles (`ref:synthetic:<role>`), resolved by
 *   the controller; token values never touch this database.
 */
export const DEMO_IDS = {
  ownerUserId: "b0000000-0000-4000-8000-000000000001",
  aliceUserId: "b0000000-0000-4000-8000-000000000002",
  bobUserId: "b0000000-0000-4000-8000-000000000003",
  workspaceId: "a0a0a0a0-0000-4000-8000-000000000001",
  projectId: "a0a0a0a0-0000-4000-8000-000000000002",
  vulnerableEnvId: "a0a0a0a0-0000-4000-8000-000000000003",
  patchedEnvId: "a0a0a0a0-0000-4000-8000-000000000004",
  targetId: "a0a0a0a0-0000-4000-8000-000000000005",
  aliceIdentityId: "a0a0a0a0-0000-4000-8000-000000000006",
  bobIdentityId: "a0a0a0a0-0000-4000-8000-000000000007",
  scopeId: "a0a0a0a0-0000-4000-8000-000000000008",
} as const;

export const DEMO = {
  workspaceSlug: "highcastle-demo",
  workspaceName: "HighCastle Demo",
  projectSlug: "invoice-auth-demo",
  projectName: "Invoice Authorization Demo",
  projectDescription: "Two-user invoice authorization demo: Alice must not read Bob's invoices.",
  vulnerableRevision: "lab-v1-vulnerable",
  patchedRevision: "lab-v2-patched",
  fixtureVersion: "1.0.0",
  targetOrigin: "https://target-lab.internal",
  scopeHost: "target-lab",
  approvedAt: "2026-11-07T00:00:00.000Z",
} as const;

export interface SeedDemoResult {
  workspaceId: string;
  projectId: string;
  vulnerableEnvId: string;
  patchedEnvId: string;
  targetId: string;
  aliceIdentityId: string;
  bobIdentityId: string;
  scopeId: string;
  scopeHash: string;
}

/**
 * Seed (or re-seed) the demo tenant. Safe to run multiple times: existing
 * rows are reused by slug/ID/hash and never duplicated.
 */
export async function seedDemo(db: Database): Promise<SeedDemoResult> {
  const ids = DEMO_IDS;

  // 1. Workspace + owner/members (idempotent by slug).
  const bySlug = await getWorkspaceBySlug(db, DEMO.workspaceSlug);
  if (!bySlug) {
    await createWorkspace(db, {
      id: ids.workspaceId,
      slug: DEMO.workspaceSlug,
      name: DEMO.workspaceName,
      ownerUserId: ids.ownerUserId,
    });
    await addWorkspaceMember(db, {
      workspaceId: ids.workspaceId,
      userId: ids.aliceUserId,
      role: "developer",
    }).catch(() => null);
    await addWorkspaceMember(db, {
      workspaceId: ids.workspaceId,
      userId: ids.bobUserId,
      role: "viewer",
    }).catch(() => null);
  }
  const workspaceId = ids.workspaceId;

  // 2. Project (idempotent by ID).
  const existingProject = await getProject(db, workspaceId, ids.projectId);
  if (!existingProject) {
    await createProject(db, {
      id: ids.projectId,
      workspaceId,
      slug: DEMO.projectSlug,
      name: DEMO.projectName,
      description: DEMO.projectDescription,
      kind: "demo",
      createdBy: ids.ownerUserId,
    });
  }

  // 3. Environments: L11 vulnerable + patched revisions (idempotent by ID).
  const existingVuln = await getEnvironment(db, workspaceId, ids.vulnerableEnvId);
  if (!existingVuln) {
    await createEnvironment(db, {
      id: ids.vulnerableEnvId,
      workspaceId,
      projectId: ids.projectId,
      label: "Vulnerable attack-twin (lab-v1-vulnerable)",
      kind: "attack_twin",
      currentRevision: DEMO.vulnerableRevision,
      fixtureVersion: DEMO.fixtureVersion,
      networkProfileId: "lab-isolated-net",
    });
  }
  const existingPatched = await getEnvironment(db, workspaceId, ids.patchedEnvId);
  if (!existingPatched) {
    await createEnvironment(db, {
      id: ids.patchedEnvId,
      workspaceId,
      projectId: ids.projectId,
      label: "Patched attack-twin (lab-v2-patched)",
      kind: "attack_twin",
      currentRevision: DEMO.patchedRevision,
      fixtureVersion: DEMO.fixtureVersion,
      networkProfileId: "lab-isolated-net",
    });
  }

  // 4. Target (verified synthetic lab attestation).
  const existingTarget = await getTarget(db, workspaceId, ids.targetId);
  if (!existingTarget) {
    await createTarget(db, {
      id: ids.targetId,
      workspaceId,
      projectId: ids.projectId,
      environmentId: ids.vulnerableEnvId,
      label: "Synthetic invoice lab",
      canonicalOrigin: DEMO.targetOrigin,
      targetKind: "demo",
    });
    await verifyTarget(db, workspaceId, ids.targetId, {
      method: "synthetic_lab_attestation",
      verifiedBy: ids.ownerUserId,
      verificationExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
    });
  }

  // 5. Synthetic test identities (Alice + Bob).
  const identities = await listTestIdentities(db, workspaceId, ids.vulnerableEnvId);
  if (!identities.some((i) => i.id === ids.aliceIdentityId)) {
    await createTestIdentity(db, {
      id: ids.aliceIdentityId,
      workspaceId,
      environmentId: ids.vulnerableEnvId,
      label: "Alice (tenant_A)",
      role: "alice",
      fixtureSubjectId: "user_A",
      credentialSecretRef: "ref:synthetic:alice",
    });
  }
  if (!identities.some((i) => i.id === ids.bobIdentityId)) {
    await createTestIdentity(db, {
      id: ids.bobIdentityId,
      workspaceId,
      environmentId: ids.vulnerableEnvId,
      label: "Bob (tenant_B)",
      role: "bob",
      fixtureSubjectId: "user_B",
      credentialSecretRef: "ref:synthetic:bob",
    });
  }

  // 6. Locked authorization scope (idempotent by content hash → fixed ID).
  // Budgets mirror the L04 demo grant so policy evaluation agrees.
  const existingScope = await getScope(db, workspaceId, ids.scopeId);
  let scopeHash: string;
  if (existingScope) {
    scopeHash = existingScope.scopeHash;
  } else {
    const created = await createAuthorizationScope(db, {
      id: ids.scopeId,
      approvedAt: new Date(DEMO.approvedAt),
      workspaceId,
      projectId: ids.projectId,
      targetId: ids.targetId,
      actorUserId: ids.ownerUserId,
      version: 1,
      allowedHosts: [DEMO.scopeHost],
      allowedPaths: ["/api/invoices"],
      deniedPaths: ["/api/invoices/admin"],
      allowedTestPackIds: ["bola-invoice-v1"],
      allowedMethods: ["GET"],
      maxDurationSeconds: 60,
      maxRequests: 16,
      maxConcurrency: 1,
      maxMemoryMb: 256,
      maxCpuMillicores: 500,
      networkProfileId: "lab-isolated-net",
      permittedEnvironmentId: ids.vulnerableEnvId,
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    });
    scopeHash = created.scopeHash;
    await recordAuditEvent(db, {
      workspaceId,
      actorUserId: ids.ownerUserId,
      actorType: "user",
      action: "scope.approved",
      entityType: "authorization_scope",
      entityId: created.id,
      policyHash: scopeHash,
      redactedDetails: { version: 1 },
    });
  }

  return {
    workspaceId,
    projectId: ids.projectId,
    vulnerableEnvId: ids.vulnerableEnvId,
    patchedEnvId: ids.patchedEnvId,
    targetId: ids.targetId,
    aliceIdentityId: ids.aliceIdentityId,
    bobIdentityId: ids.bobIdentityId,
    scopeId: ids.scopeId,
    scopeHash,
  };
}
