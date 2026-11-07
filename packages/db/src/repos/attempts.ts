import { and, eq } from "drizzle-orm";
import type { Database, DbExecutor } from "../client.js";
import {
  containmentEvents,
  evidenceArtifacts,
  runnerInstances,
  scans,
  testAttempts,
} from "../schema/tables.js";
import { DbError } from "../errors.js";

// --- Test attempts ---

export interface CreateAttemptInput {
  workspaceId: string;
  scanId: string;
  packId: "bola-invoice-v1";
  packVersion: string;
  proposalId?: string | null;
  planHash: string;
  scopeHash: string;
  actorIdentityId?: string | null;
  targetRevision: string;
  attemptNumber?: number;
}

const TERMINAL_ATTEMPT_STATUSES = new Set([
  "completed",
  "timeout",
  "failed",
  "canceled",
  "blocked",
]);

/**
 * Insert an attempt. Retries of the same plan reuse the row: the
 * `(scan_id, plan_hash, attempt_number)` key makes re-submission idempotent
 * (returns the existing row instead of duplicating).
 */
export async function createAttempt(db: Database, input: CreateAttemptInput) {
  return db.transaction(async (tx) => {
    const scan = await tx
      .select({ id: scans.id })
      .from(scans)
      .where(and(eq(scans.id, input.scanId), eq(scans.workspaceId, input.workspaceId)))
      .limit(1);
    if (!scan[0]) throw DbError.notFound("scan", input.scanId);
    const attemptNumber = input.attemptNumber ?? 1;
    const [inserted] = await tx
      .insert(testAttempts)
      .values({
        workspaceId: input.workspaceId,
        scanId: input.scanId,
        packId: input.packId,
        packVersion: input.packVersion,
        proposalId: input.proposalId ?? null,
        planHash: input.planHash,
        scopeHash: input.scopeHash,
        actorIdentityId: input.actorIdentityId ?? null,
        targetRevision: input.targetRevision,
        attemptNumber,
        status: "proposed",
      })
      .onConflictDoNothing()
      .returning();
    if (inserted) return inserted;
    const [existing] = await tx
      .select()
      .from(testAttempts)
      .where(
        and(
          eq(testAttempts.scanId, input.scanId),
          eq(testAttempts.planHash, input.planHash),
          eq(testAttempts.attemptNumber, attemptNumber),
        ),
      )
      .limit(1);
    if (!existing) throw new DbError("internal", "attempt upsert produced no row");
    return existing;
  });
}

/** Tenant-scoped read. */
export async function getAttempt(db: DbExecutor, workspaceId: string, attemptId: string) {
  const rows = await db
    .select()
    .from(testAttempts)
    .where(and(eq(testAttempts.id, attemptId), eq(testAttempts.workspaceId, workspaceId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listAttempts(db: DbExecutor, workspaceId: string, scanId: string) {
  return db
    .select()
    .from(testAttempts)
    .where(and(eq(testAttempts.scanId, scanId), eq(testAttempts.workspaceId, workspaceId)))
    .orderBy(testAttempts.attemptNumber);
}

export type AttemptStatus =
  | "proposed"
  | "validated"
  | "blocked"
  | "queued"
  | "running"
  | "completed"
  | "timeout"
  | "failed"
  | "canceled";

/** Status move; terminal attempts reject further transitions. */
export async function updateAttemptStatus(
  db: DbExecutor,
  workspaceId: string,
  attemptId: string,
  status: AttemptStatus,
) {
  const existing = await getAttempt(db, workspaceId, attemptId);
  if (!existing) throw DbError.notFound("test_attempt", attemptId);
  if (TERMINAL_ATTEMPT_STATUSES.has(existing.status)) {
    throw DbError.conflict(`attempt is already terminal (${existing.status})`, { attemptId });
  }
  const patch: Partial<typeof testAttempts.$inferInsert> = { status };
  const now = new Date();
  if (existing.startedAt === null && (status === "running" || status === "queued")) {
    patch.startedAt = now;
  }
  if (TERMINAL_ATTEMPT_STATUSES.has(status)) patch.endedAt = now;
  const [row] = await db
    .update(testAttempts)
    .set(patch)
    .where(
      and(
        eq(testAttempts.id, attemptId),
        eq(testAttempts.workspaceId, workspaceId),
        eq(testAttempts.status, existing.status),
      ),
    )
    .returning();
  if (!row) throw DbError.conflict("attempt was modified concurrently", { attemptId });
  return row;
}

export interface AttemptVerdict {
  oracleVersion: string;
  verdict: "reproduced" | "not_reproduced" | "inconclusive";
  reasonCode?: string | null;
  positiveControlPassed?: boolean | null;
  negativeSecurityConditionMet?: boolean | null;
}

/**
 * Record the independent oracle verdict. Write-once: a second verdict for
 * the same attempt throws `conflict` instead of silently overwriting —
 * contradictory observations must become a new attempt, not an edit.
 */
export async function recordAttemptVerdict(
  db: DbExecutor,
  workspaceId: string,
  attemptId: string,
  verdict: AttemptVerdict,
) {
  const existing = await getAttempt(db, workspaceId, attemptId);
  if (!existing) throw DbError.notFound("test_attempt", attemptId);
  if (existing.verifierVerdict !== null) {
    throw DbError.conflict("attempt verdict is already recorded", { attemptId });
  }
  const [row] = await db
    .update(testAttempts)
    .set({
      oracleVersion: verdict.oracleVersion,
      verifierVerdict: verdict.verdict,
      verdictReasonCode: verdict.reasonCode ?? null,
      positiveControlPassed: verdict.positiveControlPassed ?? null,
      negativeSecurityConditionMet: verdict.negativeSecurityConditionMet ?? null,
      status: "completed",
    })
    .where(and(eq(testAttempts.id, attemptId), eq(testAttempts.workspaceId, workspaceId)))
    .returning();
  if (!row) throw DbError.notFound("test_attempt", attemptId);
  return row;
}

// --- Runner instances ---

export interface CreateRunnerInput {
  workspaceId: string;
  scanId: string;
  sandboxId: string;
  imageDigest: string;
  networkProfile: string;
  resourceLimits: Record<string, unknown>;
}

export async function createRunnerInstance(db: DbExecutor, input: CreateRunnerInput) {
  const [row] = await db
    .insert(runnerInstances)
    .values({
      workspaceId: input.workspaceId,
      scanId: input.scanId,
      sandboxId: input.sandboxId,
      imageDigest: input.imageDigest,
      networkProfile: input.networkProfile,
      resourceLimits: input.resourceLimits,
      status: "allocated",
    })
    .returning();
  if (!row) throw new DbError("internal", "runner insert returned no row");
  return row;
}

export async function updateRunnerInstance(
  db: DbExecutor,
  workspaceId: string,
  runnerId: string,
  patch: Partial<{
    status:
      | "allocated"
      | "created"
      | "running"
      | "stopping"
      | "destroyed"
      | "cleanup_verified"
      | "error"
      | "forced_stop"
      | "operator_alert";
    startedAt: Date | null;
    terminatedAt: Date | null;
    cleanupVerifiedAt: Date | null;
    timeoutAt: Date | null;
    exitCode: number | null;
    reason: string | null;
  }>,
) {
  const [row] = await db
    .update(runnerInstances)
    .set(patch)
    .where(and(eq(runnerInstances.id, runnerId), eq(runnerInstances.workspaceId, workspaceId)))
    .returning();
  if (!row) throw DbError.notFound("runner_instance", runnerId);
  return row;
}

// --- Evidence artifacts ---

const SHA256_RE = /^[0-9a-f]{64}$/;

export interface CreateEvidenceInput {
  workspaceId: string;
  scanId: string;
  attemptId?: string | null;
  artifactKind:
    | "redacted_request"
    | "redacted_response"
    | "browser_screenshot"
    | "runner_stdout"
    | "containment"
    | "oracle"
    | "code_reference";
  storageKind: "db" | "object";
  storageKey: string;
  sha256: string;
  byteSize?: number;
  contentType?: string;
  retentionUntil?: Date | null;
}

/**
 * Persist evidence metadata. Guards: only redacted artifacts are stored
 * (`redacted` is always true — raw output is transient), the storage key
 * must be unguessable (≥16 chars, never a browser path), and the digest
 * must be a full SHA-256 hex string.
 */
export async function createEvidenceArtifact(db: DbExecutor, input: CreateEvidenceInput) {
  if (input.storageKey.length < 16) {
    throw new DbError("validation_error", "storageKey must be unguessable (≥16 chars)");
  }
  if (!SHA256_RE.test(input.sha256)) {
    throw new DbError("validation_error", "sha256 must be lowercase hex (64 chars)");
  }
  const [row] = await db
    .insert(evidenceArtifacts)
    .values({
      workspaceId: input.workspaceId,
      scanId: input.scanId,
      attemptId: input.attemptId ?? null,
      artifactKind: input.artifactKind,
      storageKind: input.storageKind,
      storageKey: input.storageKey,
      sha256: input.sha256,
      byteSize: input.byteSize ?? 0,
      contentType: input.contentType ?? "application/octet-stream",
      redacted: true,
      retentionUntil: input.retentionUntil ?? null,
    })
    .returning();
  if (!row) throw new DbError("internal", "evidence insert returned no row");
  return row;
}

export async function listEvidenceForAttempt(
  db: DbExecutor,
  workspaceId: string,
  attemptId: string,
) {
  return db
    .select()
    .from(evidenceArtifacts)
    .where(
      and(
        eq(evidenceArtifacts.attemptId, attemptId),
        eq(evidenceArtifacts.workspaceId, workspaceId),
      ),
    );
}

// --- Containment events ---

export interface RecordContainmentInput {
  workspaceId: string;
  scanId: string;
  attemptId?: string | null;
  runnerId: string;
  ruleId:
    | "network.egress_denied"
    | "filesystem.access_denied"
    | "resource.limit_enforced"
    | "process.limit_enforced"
    | "secret.access_denied";
  policyVersion: string;
  deniedOperation: string;
  safeMetadata?: Record<string, string | number | boolean>;
}

/**
 * Record a runtime denial. A containment event is ALWAYS a denial
 * (`allowed=false`, `runtimeEnforced=true`) — callers cannot record a
 * permitted action here, and a blocked action is never a vulnerability.
 */
export async function recordContainmentEvent(db: DbExecutor, input: RecordContainmentInput) {
  const [row] = await db
    .insert(containmentEvents)
    .values({
      workspaceId: input.workspaceId,
      scanId: input.scanId,
      attemptId: input.attemptId ?? null,
      runnerId: input.runnerId,
      ruleId: input.ruleId,
      policyVersion: input.policyVersion,
      deniedOperation: input.deniedOperation,
      allowed: false,
      runtimeEnforced: true,
      safeMetadata: input.safeMetadata ?? {},
    })
    .returning();
  if (!row) throw new DbError("internal", "containment insert returned no row");
  return row;
}

export async function listContainmentForScan(db: DbExecutor, workspaceId: string, scanId: string) {
  return db
    .select()
    .from(containmentEvents)
    .where(
      and(eq(containmentEvents.scanId, scanId), eq(containmentEvents.workspaceId, workspaceId)),
    )
    .orderBy(containmentEvents.observedAt);
}
