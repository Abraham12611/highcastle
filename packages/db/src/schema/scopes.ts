import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { scopeStatus } from "./enums.js";
import { environments } from "./projects.js";
import { targets } from "./projects.js";
import { projects } from "./projects.js";
import { workspaces } from "./tenancy.js";

/**
 * Immutable authorization scopes.
 *
 * A scope row is WRITE-ONCE for every content column: allowed hosts/paths,
 * denied paths, packs, methods, budgets, environment binding and expiry.
 * The ONLY permitted mutation is a terminal status transition
 * (`active` → `revoked` | `expired`), performed through
 * `revokeAuthorizationScope()` which refuses to touch content columns and
 * refuses to re-activate a revoked/expired scope. New terms always create a
 * new row with an incremented `version`; scans snapshot `scope_id` +
 * `scope_hash` so history stays auditable.
 *
 * `scope_hash` is the canonical content digest (unique). Its canonical
 * serialization is owned by L04 (`packages/security`); the seed in this
 * package uses the same documented algorithm (lowercase hex SHA-256 over
 * canonical JSON) until that package lands, then defers to it.
 */

export const authorizationScopes = pgTable(
  "authorization_scopes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    targetId: uuid("target_id")
      .notNull()
      .references(() => targets.id, { onDelete: "restrict" }),
    version: integer("version").notNull().default(1),
    actorUserId: uuid("actor_user_id").notNull(),
    status: scopeStatus("status").notNull().default("active"),
    allowedHosts: text("allowed_hosts").array().notNull(),
    allowedPaths: text("allowed_paths").array().notNull(),
    deniedPaths: text("denied_paths").array().notNull().default([]),
    allowedTestPackIds: text("allowed_test_pack_ids").array().notNull(),
    allowedMethods: text("allowed_methods").array().notNull(),
    maxDurationSeconds: integer("max_duration_seconds").notNull(),
    maxRequests: integer("max_requests").notNull(),
    maxConcurrency: integer("max_concurrency").notNull(),
    maxMemoryMb: integer("max_memory_mb").notNull(),
    maxCpuMillicores: integer("max_cpu_millicores"),
    networkProfileId: text("network_profile_id"),
    permittedEnvironmentId: uuid("permitted_environment_id")
      .notNull()
      .references(() => environments.id, { onDelete: "restrict" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    scopeHash: text("scope_hash").notNull().unique(),
  },
  (t) => [index("ix_scopes_target_status").on(t.targetId, t.status)],
);
