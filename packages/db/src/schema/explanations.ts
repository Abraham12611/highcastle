import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { modelCallOutcome, modelProvider, oracleVerdict, replayVerdict } from "./enums.js";
import { scans } from "./scans.js";
import { workspaces } from "./tenancy.js";

/**
 * Post-execution model explanations (Engineer 8, issue #55).
 *
 * One row per explanation call, success or safe failure. The recorded
 * `oracle_verdict` is ALWAYS the persisted independent oracle verdict —
 * never a model claim (see `parseModelExplanation`: a `verdictEcho`
 * mismatch is rejected before it can reach this table). Model prose and
 * raw payloads are stored only in redacted form. Worker wiring (insert
 * timing, scan linkage) belongs to Engineer 1; this table and repo are
 * the additive persistence seam.
 */
export const modelExplanations = pgTable(
  "model_explanations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    scanId: uuid("scan_id")
      .notNull()
      .references(() => scans.id, { onDelete: "cascade" }),
    /**
     * Explained attempt ID as opaque text (no FK): attempts are recorded
     * by the runner in `test_attempts`, and replays reference patched
     * executions. The ID is echoed back by the model and equality-checked
     * before insert, so a row can never describe a different attempt.
     */
    attemptId: text("attempt_id").notNull(),
    provider: modelProvider("provider").notNull().default("vultr"),
    /** Model requested by the operator (env-selected). */
    requestedModel: text("requested_model").notNull(),
    /** Model actually reported by the provider envelope, if any. */
    responseModel: text("response_model"),
    requestId: text("request_id"),
    tokensInput: integer("tokens_input"),
    tokensOutput: integer("tokens_output"),
    latencyMs: integer("latency_ms"),
    outcome: modelCallOutcome("outcome").notNull(),
    errorCode: text("error_code"),
    /** Persisted independent oracle verdict — the explanation's subject. */
    oracleVerdict: oracleVerdict("oracle_verdict").notNull(),
    /** Server-persisted replay verdict, when explaining a patched replay. */
    replayVerdict: replayVerdict("replay_verdict"),
    /** Validated explanation prose; NULL when validation/transport failed. */
    explanation: jsonb("explanation"),
    /** Sanitized model payload — raw prompts/credentials are never stored. */
    rawExplanationRedacted: jsonb("raw_explanation_redacted").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ix_model_explanations_scan").on(t.scanId)],
);
