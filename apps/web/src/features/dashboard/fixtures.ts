import {
  AttemptIdSchema,
  AuthorizationScopeIdSchema,
  EnvironmentIdSchema,
  FindingIdSchema,
  ProjectIdSchema,
  ScanIdSchema,
  TargetIdSchema,
  UserIdSchema,
  WorkspaceIdSchema,
} from "@highcastle/contracts";
import type { Finding, ScanSummary } from "./api";

/**
 * TEST-ONLY fixtures — never served by a production route.
 *
 * Used by unit tests and the offline gallery script (`scripts/gallery.mjs`,
 * output under /tmp) so layout work can proceed while the L18 BFF is still
 * unmerged. Shapes mirror `@highcastle/contracts` exactly; the values are
 * fixed synthetic records aligned with the L11 demo lab
 * (`lab-v1-vulnerable`, `target-lab`, `bola-invoice-v1`).
 */

export const STORY_WORKSPACE = {
  id: WorkspaceIdSchema.parse("a0a0a0a0-0000-4000-8000-000000000001"),
  slug: "highcastle-demo",
  name: "HighCastle Demo",
} as const;

export const STORY_PROJECT = {
  id: ProjectIdSchema.parse("a0a0a0a0-0000-4000-8000-000000000002"),
  workspaceId: STORY_WORKSPACE.id,
  slug: "invoice-auth-demo",
  name: "Invoice Authorization Demo",
  description: "Two-user invoice authorization demo.",
  kind: "demo" as const,
  lifecycle: "ready" as const,
  createdBy: UserIdSchema.parse("b0000000-0000-4000-8000-000000000001"),
  createdAt: "2026-11-06T11:00:00.000Z",
  updatedAt: "2026-11-06T11:00:00.000Z",
  archivedAt: null,
};

export const STORY_SCOPE = {
  id: AuthorizationScopeIdSchema.parse("a0a0a0a0-0000-4000-8000-000000000008"),
  workspaceId: STORY_WORKSPACE.id,
  projectId: STORY_PROJECT.id,
  targetId: TargetIdSchema.parse("a0a0a0a0-0000-4000-8000-000000000005"),
  version: 1,
  actorUserId: UserIdSchema.parse("b0000000-0000-4000-8000-000000000001"),
  status: "active" as const,
  allowedHosts: ["target-lab"],
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
  permittedEnvironmentId: EnvironmentIdSchema.parse("a0a0a0a0-0000-4000-8000-000000000003"),
  approvedAt: "2026-11-06T11:00:00.000Z",
  expiresAt: "2030-01-01T00:00:00.000Z",
  scopeHash: "0f67f3e7e86ff412df3c3b52024c4e1bddea097f3a18e6d48afbbb98d72b381b",
};

export const STORY_ENVIRONMENTS = [
  {
    id: EnvironmentIdSchema.parse("a0a0a0a0-0000-4000-8000-000000000003"),
    workspaceId: STORY_WORKSPACE.id,
    projectId: STORY_PROJECT.id,
    label: "Vulnerable attack-twin",
    kind: "attack_twin" as const,
    currentRevision: "lab-v1-vulnerable",
    fixtureVersion: "1.0.0",
    provisionStatus: "ready" as const,
    networkProfileId: "lab-isolated-net",
    createdAt: "2026-11-06T11:00:00.000Z",
    destroyedAt: null,
  },
  {
    id: EnvironmentIdSchema.parse("a0a0a0a0-0000-4000-8000-000000000004"),
    workspaceId: STORY_WORKSPACE.id,
    projectId: STORY_PROJECT.id,
    label: "Patched attack-twin",
    kind: "attack_twin" as const,
    currentRevision: "lab-v2-patched",
    fixtureVersion: "1.0.0",
    provisionStatus: "ready" as const,
    networkProfileId: "lab-isolated-net",
    createdAt: "2026-11-06T11:00:00.000Z",
    destroyedAt: null,
  },
];

export const STORY_TARGET = {
  id: TargetIdSchema.parse("a0a0a0a0-0000-4000-8000-000000000005"),
  workspaceId: STORY_WORKSPACE.id,
  projectId: STORY_PROJECT.id,
  environmentId: "a0a0a0a0-0000-4000-8000-000000000003",
  label: "Synthetic invoice lab",
  canonicalOrigin: "https://target-lab.internal",
  targetKind: "demo" as const,
  state: "verified" as const,
  verificationStatus: "verified",
  verificationMethod: "synthetic_lab_attestation" as const,
  verifiedBy: UserIdSchema.parse("b0000000-0000-4000-8000-000000000001"),
  verifiedAt: "2026-11-06T11:00:00.000Z",
  verificationExpiresAt: "2030-01-01T00:00:00.000Z",
};

export const STORY_SCANS: ScanSummary[] = [
  {
    scanId: ScanIdSchema.parse("c0c0c0c0-0000-4000-8000-000000000010"),
    status: "completed",
    terminal: true,
    phase: "finalizing",
    failureCode: null,
    plannedCount: 1,
    executedCount: 1,
    confirmedCount: 1,
    coverage: {
      packIds: ["bola-invoice-v1"],
      packVersions: { "bola-invoice-v1": "1.0.0" },
      oracleVersion: "bola-oracle-v1",
    },
    versions: {
      contractSchemaVersion: 1,
      scopeHash: STORY_SCOPE.scopeHash,
      targetRevision: "lab-v1-vulnerable",
      fixtureVersion: "1.0.0",
    },
  },
  {
    scanId: ScanIdSchema.parse("c0c0c0c0-0000-4000-8000-000000000011"),
    status: "executing",
    terminal: false,
    phase: "executing",
    failureCode: null,
    plannedCount: 2,
    executedCount: 1,
    confirmedCount: 0,
    coverage: {
      packIds: ["bola-invoice-v1"],
      packVersions: { "bola-invoice-v1": "1.0.0" },
      oracleVersion: "bola-oracle-v1",
    },
    versions: {
      contractSchemaVersion: 1,
      scopeHash: STORY_SCOPE.scopeHash,
      targetRevision: "lab-v1-vulnerable",
      fixtureVersion: "1.0.0",
    },
  },
];

export const STORY_FINDINGS: Finding[] = [
  {
    id: FindingIdSchema.parse("d0d0d0d0-0000-4000-8000-000000000020"),
    workspaceId: STORY_WORKSPACE.id,
    projectId: STORY_PROJECT.id,
    stableFingerprint: "story:bola:invoice_lookup:owner_check",
    title: "Invoice lookup missing ownership check",
    summary: "Alice could retrieve Bob's private synthetic invoice.",
    category: "broken_object_authorization",
    severity: "high",
    confidence: "confirmed_by_execution",
    remediationStatus: "in_progress",
    firstSeenAt: "2026-11-06T12:02:00.000Z",
    lastSeenAt: "2026-11-06T12:02:00.000Z",
    latestConfirmedAttemptId: AttemptIdSchema.parse("e0e0e0e0-0000-4000-8000-000000000030"),
    ownerUserId: null,
    createdAt: "2026-11-06T12:02:00.000Z",
    updatedAt: "2026-11-06T13:00:00.000Z",
  },
];
