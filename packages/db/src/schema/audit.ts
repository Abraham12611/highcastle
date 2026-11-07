import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { actorType } from "./enums.js";
import { workspaces } from "./tenancy.js";

/**
 * Append-only audit trail.
 *
 * `workspace_id` is NULLABLE: operator-level actions (emergency stop,
 * retention cleanup) may not belong to a tenant. Rows are never updated or
 * deleted by application code — retention is a documented operator decision
 * with its own audit row, not a silent `DELETE`.
 */

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "set null",
    }),
    actorUserId: uuid("actor_user_id"),
    actorType: actorType("actor_type").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    policyHash: text("policy_hash"),
    redactedDetails: jsonb("redacted_details")
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ix_audit_workspace_created").on(t.workspaceId, t.createdAt)],
);
