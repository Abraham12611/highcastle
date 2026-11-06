import { evaluateReplayVerdict } from "@highcastle/contracts";
import { and, desc, eq } from "drizzle-orm";
import type { Database, DbExecutor } from "../client.js";
import {
  findingHistory,
  findingOccurrences,
  findings,
  remediations,
  replays,
} from "../schema/tables.js";
import { DbError } from "../errors.js";

// --- Findings: dedup by (project_id, stable_fingerprint) ---

export interface UpsertFindingInput {
  workspaceId: string;
  projectId: string;
  stableFingerprint: string;
  title: string;
  summary: string;
  category: "broken_object_authorization";
  severity: "critical" | "high" | "medium" | "low" | "informational";
  confidence:
    | "suspected"
    | "supported_by_analysis"
    | "confirmed_by_execution"
    | "not_reproduced"
    | "inconclusive";
  scanId: string;
  attemptId?: string | null;
  sourceRevision?: string | null;
  targetRevision: string;
  oracleVerdict: "reproduced" | "not_reproduced" | "inconclusive";
}

const CONFIDENCE_RANK: Record<string, number> = {
  suspected: 0,
  supported_by_analysis: 1,
  confirmed_by_execution: 2,
  not_reproduced: -1,
  inconclusive: -2,
};

/**
 * Deduplicating finding write. First sight of a fingerprint inserts the
 * finding row; every sighting (first or repeat) inserts a `finding_occurrences`
 * row, bumps `last_seen_at`, and escalates `confidence` toward
 * `confirmed_by_execution` when new evidence is stronger. Returns whether the
 * finding row was newly created.
 */
export async function upsertFindingFromVerdict(db: Database, input: UpsertFindingInput) {
  return db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(findings)
      .values({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        stableFingerprint: input.stableFingerprint,
        title: input.title,
        summary: input.summary,
        category: input.category,
        severity: input.severity,
        confidence: input.confidence,
        lastSeenAt: new Date(),
        latestConfirmedAttemptId:
          input.confidence === "confirmed_by_execution" ? (input.attemptId ?? null) : null,
      })
      .onConflictDoNothing()
      .returning();
    let finding = inserted ?? null;
    let created = inserted !== undefined;
    if (!finding) {
      const [existing] = await tx
        .select()
        .from(findings)
        .where(
          and(
            eq(findings.projectId, input.projectId),
            eq(findings.stableFingerprint, input.stableFingerprint),
          ),
        )
        .limit(1);
      if (!existing) {
        throw new DbError("internal", "finding upsert produced no row");
      }
      if (existing.workspaceId !== input.workspaceId) {
        throw new DbError("conflict", "finding fingerprint is owned by another workspace");
      }
      const stronger =
        (CONFIDENCE_RANK[input.confidence] ?? -99) > (CONFIDENCE_RANK[existing.confidence] ?? -99);
      const [updated] = await tx
        .update(findings)
        .set({
          lastSeenAt: new Date(),
          updatedAt: new Date(),
          ...(stronger
            ? {
                confidence: input.confidence,
                severity: input.severity,
                summary: input.summary,
                latestConfirmedAttemptId:
                  input.confidence === "confirmed_by_execution"
                    ? (input.attemptId ?? existing.latestConfirmedAttemptId)
                    : existing.latestConfirmedAttemptId,
              }
            : {}),
        })
        .where(eq(findings.id, existing.id))
        .returning();
      if (!updated) throw new DbError("internal", "finding update produced no row");
      finding = updated;
      created = false;
    }
    const [occurrence] = await tx
      .insert(findingOccurrences)
      .values({
        workspaceId: input.workspaceId,
        findingId: finding.id,
        scanId: input.scanId,
        attemptId: input.attemptId ?? null,
        sourceRevision: input.sourceRevision ?? null,
        targetRevision: input.targetRevision,
        evidenceConfidence: input.confidence,
        oracleVerdict: input.oracleVerdict,
      })
      .onConflictDoNothing()
      .returning();
    return { finding, occurrence: occurrence ?? null, created };
  });
}

/** Tenant-scoped read. */
export async function getFinding(db: DbExecutor, workspaceId: string, findingId: string) {
  const rows = await db
    .select()
    .from(findings)
    .where(and(eq(findings.id, findingId), eq(findings.workspaceId, workspaceId)))
    .limit(1);
  return rows[0] ?? null;
}

export interface ListFindingsFilter {
  projectId?: string;
  severity?: "critical" | "high" | "medium" | "low" | "informational";
  remediationStatus?:
    | "open"
    | "in_progress"
    | "pending_verification"
    | "verified_fixed"
    | "accepted_risk"
    | "dismissed"
    | "reopened";
}

export async function listFindings(
  db: DbExecutor,
  workspaceId: string,
  filter: ListFindingsFilter = {},
) {
  const conditions = [eq(findings.workspaceId, workspaceId)];
  if (filter.projectId) conditions.push(eq(findings.projectId, filter.projectId));
  if (filter.severity) conditions.push(eq(findings.severity, filter.severity));
  if (filter.remediationStatus) {
    conditions.push(eq(findings.remediationStatus, filter.remediationStatus));
  }
  return db
    .select()
    .from(findings)
    .where(and(...conditions))
    .orderBy(desc(findings.lastSeenAt));
}

export async function listFindingOccurrences(
  db: DbExecutor,
  workspaceId: string,
  findingId: string,
) {
  return db
    .select()
    .from(findingOccurrences)
    .where(
      and(
        eq(findingOccurrences.findingId, findingId),
        eq(findingOccurrences.workspaceId, workspaceId),
      ),
    )
    .orderBy(desc(findingOccurrences.observedAt));
}

// --- Triage (human review; never awards verified_fixed) ---

export type TriageTarget =
  "open" | "in_progress" | "pending_verification" | "accepted_risk" | "dismissed" | "reopened";

/**
 * Move a finding along the remediation axis and record the move in
 * `finding_history`. `verified_fixed` is rejected here unconditionally —
 * only `completeReplay()` (driven by oracle observations) may award it.
 */
export async function triageFinding(
  db: Database,
  input: {
    workspaceId: string;
    findingId: string;
    toStatus: TriageTarget;
    reason: string;
    actorType: "user" | "operator" | "system";
    actorId?: string | null;
    ownerUserId?: string | null;
  },
) {
  // Defense in depth: the type already excludes `verified_fixed`, but a
  // plain-JS caller could still pass it — only completeReplay() may award it.
  if ((input.toStatus as string) === "verified_fixed") {
    throw new DbError("forbidden", "verified_fixed can only be awarded by replay verification");
  }
  return db.transaction(async (tx) => {
    const finding = await getFinding(tx, input.workspaceId, input.findingId);
    if (!finding) throw DbError.notFound("finding", input.findingId);
    const [updated] = await tx
      .update(findings)
      .set({
        remediationStatus: input.toStatus,
        ownerUserId: input.ownerUserId ?? finding.ownerUserId,
        updatedAt: new Date(),
      })
      .where(eq(findings.id, finding.id))
      .returning();
    if (!updated) throw DbError.notFound("finding", input.findingId);
    await tx.insert(findingHistory).values({
      workspaceId: input.workspaceId,
      findingId: finding.id,
      fromStatus: finding.remediationStatus,
      toStatus: input.toStatus,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      reason: input.reason,
    });
    return updated;
  });
}

// --- Remediations ---

export interface CreateRemediationInput {
  workspaceId: string;
  projectId: string;
  findingId: string;
  sourceCommitBefore: string;
  sourceCommitAfter?: string | null;
  summary: string;
  fixPromptRedacted?: string | null;
  requiredInvariants: string[];
}

export async function createRemediation(db: DbExecutor, input: CreateRemediationInput) {
  const finding = await getFinding(db, input.workspaceId, input.findingId);
  if (!finding) throw DbError.notFound("finding", input.findingId);
  const [row] = await db
    .insert(remediations)
    .values({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      findingId: input.findingId,
      sourceCommitBefore: input.sourceCommitBefore,
      sourceCommitAfter: input.sourceCommitAfter ?? null,
      summary: input.summary,
      fixPromptRedacted: input.fixPromptRedacted ?? null,
      requiredInvariants: input.requiredInvariants,
      status: "suggested",
    })
    .returning();
  if (!row) throw new DbError("internal", "remediation insert returned no row");
  return row;
}

export async function updateRemediationStatus(
  db: DbExecutor,
  workspaceId: string,
  remediationId: string,
  status: "suggested" | "applied" | "pending_verification" | "verified" | "failed",
) {
  const [row] = await db
    .update(remediations)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(remediations.id, remediationId), eq(remediations.workspaceId, workspaceId)))
    .returning();
  if (!row) throw DbError.notFound("remediation", remediationId);
  return row;
}

// --- Replays: fix verification linkage ---

export interface CreateReplayInput {
  workspaceId: string;
  projectId: string;
  findingId: string;
  originalAttemptId: string;
  originalScanId: string;
  replayScanId?: string | null;
  patchedEnvironmentId?: string | null;
  patchedRevision: string;
  packId: "bola-invoice-v1";
  packVersion: string;
  approvalScopeId?: string | null;
}

/**
 * Open a replay: same versioned pack, patched revision, fresh approval scope.
 * The verdict stays NULL until `completeReplay()` derives it from recorded
 * oracle observations — clients can never set it.
 */
export async function createReplay(db: DbExecutor, input: CreateReplayInput) {
  const finding = await getFinding(db, input.workspaceId, input.findingId);
  if (!finding) throw DbError.notFound("finding", input.findingId);
  const [row] = await db
    .insert(replays)
    .values({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      findingId: input.findingId,
      originalAttemptId: input.originalAttemptId,
      originalScanId: input.originalScanId,
      replayScanId: input.replayScanId ?? null,
      patchedEnvironmentId: input.patchedEnvironmentId ?? null,
      patchedRevision: input.patchedRevision,
      packId: input.packId,
      packVersion: input.packVersion,
      approvalScopeId: input.approvalScopeId ?? null,
    })
    .returning();
  if (!row) throw new DbError("internal", "replay insert returned no row");
  return row;
}

export async function getReplay(db: DbExecutor, workspaceId: string, replayId: string) {
  const rows = await db
    .select()
    .from(replays)
    .where(and(eq(replays.id, replayId), eq(replays.workspaceId, workspaceId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listReplaysForFinding(
  db: DbExecutor,
  workspaceId: string,
  findingId: string,
) {
  return db
    .select()
    .from(replays)
    .where(and(eq(replays.findingId, findingId), eq(replays.workspaceId, workspaceId)))
    .orderBy(desc(replays.createdAt));
}

export interface ReplayObservation {
  /** Legitimate own-invoice read on the patched revision. */
  legitimateRead: "pass" | "fail" | "unknown";
  /** Cross-account read on the patched revision (`pass` = denied). */
  unauthorizedReadDenied: "pass" | "fail" | "unknown";
  /** Patched run still returned another tenant's data. */
  stillReadsCrossAccount: boolean;
}

/**
 * Complete a replay from recorded oracle observations. The verdict is derived
 * by `evaluateReplayVerdict()` (contracts) — never supplied by the caller.
 * `verified_fixed` additionally flips the finding
 * `pending_verification` → `verified_fixed` with a history row;
 * `still_vulnerable` re-opens a `pending_verification` finding.
 */
export async function completeReplay(
  db: Database,
  workspaceId: string,
  replayId: string,
  observation: ReplayObservation,
) {
  return db.transaction(async (tx) => {
    const replay = await getReplay(tx, workspaceId, replayId);
    if (!replay) throw DbError.notFound("replay", replayId);
    if (replay.verdict !== null) {
      throw DbError.conflict("replay is already completed", { replayId });
    }
    const verdict = evaluateReplayVerdict(observation);
    const now = new Date();
    const [completed] = await tx
      .update(replays)
      .set({
        positiveAssertionPassed: observation.legitimateRead === "pass",
        negativeAssertionPassed: observation.unauthorizedReadDenied === "pass",
        verdict,
        completedAt: now,
      })
      .where(eq(replays.id, replayId))
      .returning();
    if (!completed) throw DbError.notFound("replay", replayId);

    const finding = await getFinding(tx, workspaceId, replay.findingId);
    if (finding && verdict === "verified_fixed") {
      const [updated] = await tx
        .update(findings)
        .set({ remediationStatus: "verified_fixed", updatedAt: now })
        .where(eq(findings.id, finding.id))
        .returning();
      if (updated) {
        await tx.insert(findingHistory).values({
          workspaceId,
          findingId: finding.id,
          fromStatus: finding.remediationStatus,
          toStatus: "verified_fixed",
          actorType: "oracle",
          actorId: null,
          reason: `replay ${replayId} verified fix on ${replay.patchedRevision}`,
        });
      }
    } else if (
      finding &&
      verdict === "still_vulnerable" &&
      finding.remediationStatus === "pending_verification"
    ) {
      await tx
        .update(findings)
        .set({ remediationStatus: "in_progress", updatedAt: now })
        .where(eq(findings.id, finding.id));
      await tx.insert(findingHistory).values({
        workspaceId,
        findingId: finding.id,
        fromStatus: "pending_verification",
        toStatus: "in_progress",
        actorType: "oracle",
        actorId: null,
        reason: `replay ${replayId} still reproduces on ${replay.patchedRevision}`,
      });
    }
    return completed;
  });
}
