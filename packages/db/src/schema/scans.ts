import { sql } from "drizzle-orm";
import {
  bigint,
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
  actorType,
  modelCallOutcome,
  modelProvider,
  modelPurpose,
  proposalRejectionCode,
  proposalValidationStatus,
  scanEventType,
  scanPhase,
  scanStatus,
  scanType,
} from "./enums.js";
import { authorizationScopes } from "./scopes.js";
import { environments, projects, targets } from "./projects.js";
import { workspaces } from "./tenancy.js";

/**
 * Scans, durable events, model calls and agent proposals.
 *
 * Ordering guarantee: `scan_events.seq` is strictly increasing per scan
 * (`unique(scan_id, seq)`). Writers MUST use `appendScanEvent()` which
 * allocates `max(seq)+1` inside the scan's transaction and retries on
 * unique-violation, so concurrent workers never produce duplicate or
 * out-of-order sequence numbers.
 */

export const scans = pgTable(
  "scans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    scopeId: uuid("scope_id")
      .notNull()
      .references(() => authorizationScopes.id, { onDelete: "restrict" }),
    sourceSnapshotRef: text("source_snapshot_ref"),
    targetId: uuid("target_id")
      .notNull()
      .references(() => targets.id, { onDelete: "restrict" }),
    environmentId: uuid("environment_id").references(() => environments.id, {
      onDelete: "set null",
    }),
    targetRevision: text("target_revision").notNull(),
    fixtureVersion: text("fixture_version"),
    scanType: scanType("scan_type").notNull().default("targeted_red_team"),
    testPackIds: text("test_pack_ids").array().notNull(),
    testPackVersions: jsonb("test_pack_versions")
      .notNull()
      .default(sql`'{}'::jsonb`),
    requestedByUserId: uuid("requested_by_user_id").notNull(),
    idempotencyKey: text("idempotency_key"),
    status: scanStatus("status").notNull().default("draft"),
    phase: scanPhase("phase"),
    planVersion: integer("plan_version"),
    plannedCount: integer("planned_count").notNull().default(0),
    executedCount: integer("executed_count").notNull().default(0),
    confirmedCount: integer("confirmed_count").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    cancelRequestedAt: timestamp("cancel_requested_at", {
      withTimezone: true,
    }),
    failureCode: text("failure_code"),
    publicDemo: boolean("public_demo").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_scans_workspace_idempotency")
      .on(t.workspaceId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} IS NOT NULL`),
    index("ix_scans_project_recent").on(t.projectId, t.createdAt),
    index("ix_scans_status_created").on(t.status, t.createdAt),
    index("ix_scans_workspace_created").on(t.workspaceId, t.createdAt),
  ],
);

export const scanEvents = pgTable(
  "scan_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    scanId: uuid("scan_id")
      .notNull()
      .references(() => scans.id, { onDelete: "cascade" }),
    seq: bigint("seq", { mode: "number" }).notNull(),
    eventType: scanEventType("event_type").notNull(),
    phase: scanPhase("phase"),
    actorType: actorType("actor_type").notNull(),
    safeSummary: text("safe_summary").notNull(),
    payloadRedacted: jsonb("payload_redacted")
      .notNull()
      .default(sql`'{}'::jsonb`),
    attemptId: uuid("attempt_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_scan_events_order").on(t.scanId, t.seq),
    index("ix_scan_events_scan_time").on(t.scanId, t.occurredAt),
  ],
);

export const modelCalls = pgTable(
  "model_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    scanId: uuid("scan_id")
      .notNull()
      .references(() => scans.id, { onDelete: "cascade" }),
    provider: modelProvider("provider").notNull().default("vultr"),
    model: text("model").notNull(),
    purpose: modelPurpose("purpose").notNull(),
    requestId: text("request_id"),
    tokensInput: integer("tokens_input"),
    tokensOutput: integer("tokens_output"),
    latencyMs: integer("latency_ms"),
    outcome: modelCallOutcome("outcome").notNull(),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ix_model_calls_scan").on(t.scanId)],
);

export const agentProposals = pgTable(
  "agent_proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    scanId: uuid("scan_id")
      .notNull()
      .references(() => scans.id, { onDelete: "cascade" }),
    modelCallId: uuid("model_call_id")
      .notNull()
      .references(() => modelCalls.id, { onDelete: "cascade" }),
    schemaVersion: integer("schema_version").notNull(),
    /** Sanitized model output — raw prompts and credentials are never stored. */
    rawProposalRedacted: jsonb("raw_proposal_redacted").notNull(),
    /** Parsed plan; NULL when validation failed (see `rejection_code`). */
    structuredPlan: jsonb("structured_plan"),
    validationStatus: proposalValidationStatus("validation_status").notNull(),
    rejectionCode: proposalRejectionCode("rejection_code"),
    policyHash: text("policy_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ix_agent_proposals_scan").on(t.scanId)],
);

/** Attempt lifecycle states that may still accept runner results. */
export const ACTIVE_ATTEMPT_STATUSES = ["proposed", "validated", "queued", "running"] as const;

/** Scan states after which no further writes (except audit) are accepted. */
export const TERMINAL_SCAN_STATUSES = ["completed", "partial", "failed", "canceled"] as const;

export type TerminalScanStatus = (typeof TERMINAL_SCAN_STATUSES)[number];

export function isTerminalScanStatus(status: string): status is TerminalScanStatus {
  return (TERMINAL_SCAN_STATUSES as readonly string[]).includes(status);
}
