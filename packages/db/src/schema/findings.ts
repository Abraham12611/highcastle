import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  actorType,
  confidence,
  findingCategory,
  oracleVerdict,
  remediationRecordStatus,
  remediationStatus,
  replayVerdict,
  severity,
  testPackId,
} from "./enums.js";
import { authorizationScopes } from "./scopes.js";
import { environments, projects } from "./projects.js";
import { scans } from "./scans.js";
import { testAttempts } from "./attempts.js";
import { workspaces } from "./tenancy.js";

/**
 * Findings, occurrences, remediation and replays.
 *
 * Three independent axes (spec § Finding lifecycle):
 * - severity: risk impact (reviewable, triage may change it).
 * - confidence: evidentiary strength — `confirmed_by_execution` ONLY from the
 *   independent oracle over recorded runner output, never from model prose.
 * - remediation_status: fix workflow position — `verified_fixed` ONLY from a
 *   replay where the baseline passes AND the cross-account read is denied.
 *
 * Deduplication: `unique(project_id, stable_fingerprint)`. A repeated
 * observation of the same fingerprint upserts the finding row and inserts a
 * new `finding_occurrences` row — counts grow, rows do not duplicate.
 * `finding_history` and `audit_events` are append-only: repositories expose
 * no update/delete for them.
 */

export const findings = pgTable(
  "findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    stableFingerprint: text("stable_fingerprint").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    category: findingCategory("category").notNull(),
    severity: severity("severity").notNull(),
    confidence: confidence("confidence").notNull(),
    remediationStatus: remediationStatus("remediation_status").notNull().default("open"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    latestConfirmedAttemptId: uuid("latest_confirmed_attempt_id"),
    ownerUserId: uuid("owner_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_project_finding_fp").on(t.projectId, t.stableFingerprint)],
);

export const findingOccurrences = pgTable(
  "finding_occurrences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    findingId: uuid("finding_id")
      .notNull()
      .references(() => findings.id, { onDelete: "cascade" }),
    scanId: uuid("scan_id")
      .notNull()
      .references(() => scans.id, { onDelete: "cascade" }),
    attemptId: uuid("attempt_id").references(() => testAttempts.id, {
      onDelete: "set null",
    }),
    sourceRevision: text("source_revision"),
    targetRevision: text("target_revision").notNull(),
    evidenceConfidence: confidence("evidence_confidence").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
    oracleVerdict: oracleVerdict("oracle_verdict").notNull(),
  },
  (t) => [
    uniqueIndex("uq_occurrence_attempt")
      .on(t.findingId, t.scanId, t.attemptId)
      .where(sql`${t.attemptId} IS NOT NULL`),
    uniqueIndex("uq_occurrence_scan_only")
      .on(t.findingId, t.scanId)
      .where(sql`${t.attemptId} IS NULL`),
    index("ix_occurrences_finding").on(t.findingId, t.observedAt),
  ],
);

export const findingHistory = pgTable(
  "finding_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    findingId: uuid("finding_id")
      .notNull()
      .references(() => findings.id, { onDelete: "cascade" }),
    fromStatus: remediationStatus("from_status").notNull(),
    toStatus: remediationStatus("to_status").notNull(),
    actorType: actorType("actor_type").notNull(),
    actorId: uuid("actor_id"),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ix_finding_history_finding").on(t.findingId, t.createdAt)],
);

export const remediations = pgTable(
  "remediations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    findingId: uuid("finding_id")
      .notNull()
      .references(() => findings.id, { onDelete: "cascade" }),
    sourceCommitBefore: text("source_commit_before").notNull(),
    sourceCommitAfter: text("source_commit_after"),
    summary: text("summary").notNull(),
    fixPromptRedacted: text("fix_prompt_redacted"),
    requiredInvariants: jsonb("required_invariants")
      .notNull()
      .default(sql`'[]'::jsonb`),
    status: remediationRecordStatus("status").notNull().default("suggested"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ix_remediations_finding").on(t.findingId)],
);

export const replays = pgTable(
  "replays",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    findingId: uuid("finding_id")
      .notNull()
      .references(() => findings.id, { onDelete: "cascade" }),
    /**
     * Immutable provenance: the exact attempt/scan being re-verified.
     * Plain UUIDs (no FK) so the replay record survives retention cleanup
     * of the original execution rows.
     */
    originalAttemptId: uuid("original_attempt_id").notNull(),
    originalScanId: uuid("original_scan_id").notNull(),
    /** The new scan executing the SAME versioned pack on the patched target. */
    replayScanId: uuid("replay_scan_id"),
    patchedEnvironmentId: uuid("patched_environment_id").references(() => environments.id, {
      onDelete: "set null",
    }),
    patchedRevision: text("patched_revision").notNull(),
    packId: testPackId("pack_id").notNull(),
    packVersion: text("pack_version").notNull(),
    approvalScopeId: uuid("approval_scope_id").references(() => authorizationScopes.id, {
      onDelete: "set null",
    }),
    positiveAssertionPassed: boolean("positive_assertion_passed"),
    negativeAssertionPassed: boolean("negative_assertion_passed"),
    /**
     * Link to the persisted oracle evidence artifact (`evidence_artifacts`,
     * kind `oracle`) the verdict was derived from. NULL until completion —
     * a replay with no recorded oracle evidence can never be `verified_fixed`.
     */
    oracleEvidenceId: uuid("oracle_evidence_id"),
    /** Oracle version string recorded alongside the verdict (e.g. `bola-oracle-v1`). */
    oracleVersion: text("oracle_version"),
    /**
     * Derived ONLY by `evaluateReplayVerdict()` from recorded observations —
     * never set from client input. NULL until the replay scan completes.
     */
    verdict: replayVerdict("verdict"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("ix_replays_finding_created").on(t.findingId, t.createdAt)],
);
