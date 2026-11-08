import { and, asc, desc, eq } from "drizzle-orm";
import type { DbExecutor } from "../client.js";
import { environments, projects, targets, testIdentities } from "../schema/tables.js";
import { DbError } from "../errors.js";

// --- Projects ---

export interface CreateProjectInput {
  /** Optional deterministic ID (fixtures/seeds); random UUID otherwise. */
  id?: string;
  workspaceId: string;
  slug: string;
  name: string;
  description?: string | null;
  kind?: "demo" | "repo" | "url";
  createdBy: string;
}

export async function createProject(db: DbExecutor, input: CreateProjectInput) {
  const [row] = await db
    .insert(projects)
    .values({
      id: input.id,
      workspaceId: input.workspaceId,
      slug: input.slug,
      name: input.name,
      description: input.description ?? null,
      kind: input.kind ?? "demo",
      createdBy: input.createdBy,
    })
    .returning();
  if (!row) throw new DbError("internal", "project insert returned no row");
  return row;
}

/** Tenant-scoped read: returns null for other-tenant IDs (never leaks). */
export async function getProject(db: DbExecutor, workspaceId: string, projectId: string) {
  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listProjects(db: DbExecutor, workspaceId: string) {
  return db
    .select()
    .from(projects)
    .where(eq(projects.workspaceId, workspaceId))
    .orderBy(desc(projects.createdAt));
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
  lifecycle?: "draft" | "ready" | "needs_attention" | "paused" | "archived";
}

export async function updateProject(
  db: DbExecutor,
  workspaceId: string,
  projectId: string,
  patch: UpdateProjectInput,
) {
  const existing = await getProject(db, workspaceId, projectId);
  if (!existing) throw DbError.notFound("project", projectId);
  const archivedAt =
    patch.lifecycle === "archived"
      ? (existing.archivedAt ?? new Date())
      : patch.lifecycle !== undefined
        ? null
        : existing.archivedAt;
  const [row] = await db
    .update(projects)
    .set({ ...patch, archivedAt, updatedAt: new Date() })
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)))
    .returning();
  if (!row) throw DbError.notFound("project", projectId);
  return row;
}

// --- Environments ---

export interface CreateEnvironmentInput {
  /** Optional deterministic ID (fixtures/seeds); random UUID otherwise. */
  id?: string;
  workspaceId: string;
  projectId: string;
  label: string;
  kind: "attack_twin" | "staging";
  currentRevision: string;
  fixtureVersion: string;
  networkProfileId?: string | null;
  /**
   * Provisioning state. New environments start `provisioning` unless the
   * lab is already live (demo fixtures pass `ready` explicitly).
   */
  provisionStatus?: "provisioning" | "ready" | "degraded" | "destroyed" | "failed";
}

/** Environment must belong to the same workspace + project (verified join). */
export async function createEnvironment(db: DbExecutor, input: CreateEnvironmentInput) {
  const project = await getProject(db, input.workspaceId, input.projectId);
  if (!project) throw DbError.notFound("project", input.projectId);
  const [row] = await db
    .insert(environments)
    .values({
      id: input.id,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      label: input.label,
      kind: input.kind,
      currentRevision: input.currentRevision,
      fixtureVersion: input.fixtureVersion,
      networkProfileId: input.networkProfileId ?? null,
      provisionStatus: input.provisionStatus ?? "provisioning",
    })
    .returning();
  if (!row) throw new DbError("internal", "environment insert returned no row");
  return row;
}

export async function getEnvironment(db: DbExecutor, workspaceId: string, environmentId: string) {
  const rows = await db
    .select()
    .from(environments)
    .where(and(eq(environments.id, environmentId), eq(environments.workspaceId, workspaceId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listEnvironments(db: DbExecutor, workspaceId: string, projectId: string) {
  return db
    .select()
    .from(environments)
    .where(and(eq(environments.projectId, projectId), eq(environments.workspaceId, workspaceId)));
}

/** Pin a new immutable revision (old value stays in scan history). */
export async function pinEnvironmentRevision(
  db: DbExecutor,
  workspaceId: string,
  environmentId: string,
  revision: string,
) {
  const existing = await getEnvironment(db, workspaceId, environmentId);
  if (!existing) throw DbError.notFound("environment", environmentId);
  const [row] = await db
    .update(environments)
    .set({ currentRevision: revision })
    .where(and(eq(environments.id, environmentId), eq(environments.workspaceId, workspaceId)))
    .returning();
  if (!row) throw DbError.notFound("environment", environmentId);
  return row;
}

// --- Targets ---

export interface CreateTargetInput {
  /** Optional deterministic ID (fixtures/seeds); random UUID otherwise. */
  id?: string;
  workspaceId: string;
  projectId: string;
  environmentId?: string | null;
  label: string;
  canonicalOrigin: string;
  targetKind?: "demo" | "staging" | "approved_other";
}

export async function createTarget(db: DbExecutor, input: CreateTargetInput) {
  const project = await getProject(db, input.workspaceId, input.projectId);
  if (!project) throw DbError.notFound("project", input.projectId);
  if (input.environmentId) {
    const env = await getEnvironment(db, input.workspaceId, input.environmentId);
    if (!env) throw DbError.notFound("environment", input.environmentId);
  }
  const [row] = await db
    .insert(targets)
    .values({
      id: input.id,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      environmentId: input.environmentId ?? null,
      label: input.label,
      canonicalOrigin: input.canonicalOrigin,
      targetKind: input.targetKind ?? "demo",
    })
    .returning();
  if (!row) throw new DbError("internal", "target insert returned no row");
  return row;
}

export async function getTarget(db: DbExecutor, workspaceId: string, targetId: string) {
  const rows = await db
    .select()
    .from(targets)
    .where(and(eq(targets.id, targetId), eq(targets.workspaceId, workspaceId)))
    .limit(1);
  return rows[0] ?? null;
}

/** All targets registered for a project (tenant-scoped, stable order). */
export async function listTargets(db: DbExecutor, workspaceId: string, projectId: string) {
  return db
    .select()
    .from(targets)
    .where(and(eq(targets.workspaceId, workspaceId), eq(targets.projectId, projectId)))
    .orderBy(asc(targets.label), asc(targets.id));
}

/** Record a successful out-of-band target verification (attestation). */
export async function verifyTarget(
  db: DbExecutor,
  workspaceId: string,
  targetId: string,
  input: {
    method: "synthetic_lab_attestation" | "dns_challenge" | "http_challenge" | "manual_review";
    verifiedBy: string;
    verificationExpiresAt?: Date | null;
  },
) {
  const existing = await getTarget(db, workspaceId, targetId);
  if (!existing) throw DbError.notFound("target", targetId);
  const now = new Date();
  const [row] = await db
    .update(targets)
    .set({
      state: "verified",
      verificationStatus: "verified",
      verificationMethod: input.method,
      verifiedBy: input.verifiedBy,
      verifiedAt: now,
      verificationExpiresAt: input.verificationExpiresAt ?? null,
    })
    .where(and(eq(targets.id, targetId), eq(targets.workspaceId, workspaceId)))
    .returning();
  if (!row) throw DbError.notFound("target", targetId);
  return row;
}

// --- Test identities (synthetic fixtures only) ---

export interface CreateTestIdentityInput {
  /** Optional deterministic ID (fixtures/seeds); random UUID otherwise. */
  id?: string;
  workspaceId: string;
  environmentId: string;
  label: string;
  role: "alice" | "bob";
  fixtureSubjectId: string;
  credentialSecretRef?: string | null;
}

export async function createTestIdentity(db: DbExecutor, input: CreateTestIdentityInput) {
  const env = await getEnvironment(db, input.workspaceId, input.environmentId);
  if (!env) throw DbError.notFound("environment", input.environmentId);
  const [row] = await db
    .insert(testIdentities)
    .values({
      id: input.id,
      workspaceId: input.workspaceId,
      environmentId: input.environmentId,
      label: input.label,
      role: input.role,
      synthetic: true,
      fixtureSubjectId: input.fixtureSubjectId,
      credentialSecretRef: input.credentialSecretRef ?? null,
    })
    .returning();
  if (!row) throw new DbError("internal", "test identity insert returned no row");
  return row;
}

export async function listTestIdentities(
  db: DbExecutor,
  workspaceId: string,
  environmentId: string,
) {
  return db
    .select()
    .from(testIdentities)
    .where(
      and(
        eq(testIdentities.environmentId, environmentId),
        eq(testIdentities.workspaceId, workspaceId),
      ),
    );
}
