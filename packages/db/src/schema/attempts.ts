import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  attemptStatus,
  containmentRuleId,
  evidenceArtifactKind,
  evidenceStorageKind,
  oracleVerdict,
  runnerStatus,
  testPackId,
} from "./enums.js";
import { agentProposals, scans } from "./scans.js";
import { testIdentities } from "./projects.js";
import { workspaces } from "./tenancy.js";

/**
 * Test attempts, runner instances, evidence and containment.
 *
 * Identity rules enforced here and in repositories:
 * - `test_attempts.attempt_number` is unique per `(scan_id, plan_hash)`;
 *   retries reuse the attempt row, they do not insert duplicates.
 * - `runner_instances.sandbox_id` is unique: one sandbox per instance row,
 *   one instance per attempt execution.
 * - `evidence_artifacts.storage_key` is an unguessable opaque key, never a
 *   browser-addressable path. Stored artifacts are ALWAYS redacted.
 * - `containment_events` record runtime denials (allowed=false,
 *   runtime_enforced=true); a blocked action is containment evidence,
 *   never a vulnerability finding.
 */

export const testAttempts = pgTable(
  "test_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    scanId: uuid("scan_id")
      .notNull()
      .references(() => scans.id, { onDelete: "cascade" }),
    packId: testPackId("pack_id").notNull(),
    packVersion: text("pack_version").notNull(),
    /** References `agent_proposals.id` (the validated hypothesis/plan). */
    proposalId: uuid("proposal_id").references(() => agentProposals.id, {
      onDelete: "set null",
    }),
    planHash: text("plan_hash").notNull(),
    scopeHash: text("scope_hash").notNull(),
    actorIdentityId: uuid("actor_identity_id").references(() => testIdentities.id, {
      onDelete: "set null",
    }),
    targetRevision: text("target_revision").notNull(),
    attemptNumber: integer("attempt_number").notNull().default(1),
    status: attemptStatus("status").notNull().default("proposed"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    /** Opaque runner reference; NULL until the controller provisions one. */
    runnerId: uuid("runner_id"),
    oracleVersion: text("oracle_version"),
    verifierVerdict: oracleVerdict("verifier_verdict"),
    verdictReasonCode: text("verdict_reason_code"),
    positiveControlPassed: boolean("positive_control_passed"),
    negativeSecurityConditionMet: boolean("negative_security_condition_met"),
  },
  (t) => [
    uniqueIndex("uq_attempts_scan_plan_number").on(t.scanId, t.planHash, t.attemptNumber),
    index("ix_attempts_scan_started").on(t.scanId, t.startedAt),
  ],
);

export const runnerInstances = pgTable(
  "runner_instances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    scanId: uuid("scan_id")
      .notNull()
      .references(() => scans.id, { onDelete: "cascade" }),
    sandboxId: text("sandbox_id").notNull().unique(),
    imageDigest: text("image_digest").notNull(),
    networkProfile: text("network_profile").notNull(),
    resourceLimits: jsonb("resource_limits")
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: runnerStatus("status").notNull().default("allocated"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    terminatedAt: timestamp("terminated_at", { withTimezone: true }),
    cleanupVerifiedAt: timestamp("cleanup_verified_at", {
      withTimezone: true,
    }),
    timeoutAt: timestamp("timeout_at", { withTimezone: true }),
    exitCode: integer("exit_code"),
    reason: text("reason"),
  },
  (t) => [index("ix_runners_status_created").on(t.status, t.createdAt)],
);

export const evidenceArtifacts = pgTable(
  "evidence_artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    scanId: uuid("scan_id")
      .notNull()
      .references(() => scans.id, { onDelete: "cascade" }),
    attemptId: uuid("attempt_id").references(() => testAttempts.id, {
      onDelete: "set null",
    }),
    artifactKind: evidenceArtifactKind("artifact_kind").notNull(),
    storageKind: evidenceStorageKind("storage_kind").notNull(),
    storageKey: text("storage_key").notNull(),
    sha256: text("sha256").notNull(),
    byteSize: integer("byte_size").notNull().default(0),
    contentType: text("content_type").notNull().default("application/octet-stream"),
    redacted: boolean("redacted").notNull().default(true),
    retentionUntil: timestamp("retention_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ix_evidence_tenant_attempt").on(t.workspaceId, t.attemptId)],
);

export const containmentEvents = pgTable(
  "containment_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    scanId: uuid("scan_id")
      .notNull()
      .references(() => scans.id, { onDelete: "cascade" }),
    attemptId: uuid("attempt_id").references(() => testAttempts.id, {
      onDelete: "set null",
    }),
    /**
     * Runner reference kept as a plain UUID (no FK): janitor reaping may
     * delete `runner_instances` rows after `cleanup_verified_at`, while the
     * containment record must survive as audit evidence.
     */
    runnerId: uuid("runner_id").notNull(),
    ruleId: containmentRuleId("rule_id").notNull(),
    policyVersion: text("policy_version").notNull(),
    deniedOperation: text("denied_operation").notNull(),
    allowed: boolean("allowed").notNull().default(false),
    runtimeEnforced: boolean("runtime_enforced").notNull().default(true),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
    safeMetadata: jsonb("safe_metadata").default(sql`'{}'::jsonb`),
  },
  (t) => [index("ix_containment_scan_time").on(t.scanId, t.observedAt)],
);

/** bigint seq columns use plain numbers in JS. */
export type ScanEventSeq = number;
