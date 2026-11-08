import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { workspaces } from "./tenancy.js";

/**
 * External source connections (lane L13/GitHub via Composio).
 *
 * `github_source_connections` — a user's OAuth link to GitHub through
 * the managed Composio auth config. Scoped by owner (internal/Clerk
 * user id); workspaceId stays nullable until account→workspace
 * membership binding lands (L02). Status is a text column checked at
 * the repo layer — the set is small and stable.
 *
 * `github_repo_sources` — the explicitly selected repository snapshot:
 * repo identity + immutable commit SHA recorded at selection time.
 * One active selection per connection (unique on connectionId);
 * re-selection updates the row and records `selected_at` anew.
 */

export type SourceConnectionStatus =
  | "pending" // link flow started, awaiting user OAuth completion
  | "active" // connected account is ACTIVE at Composio
  | "expired"
  | "revoked"
  | "disconnected";

export const githubSourceConnections = pgTable(
  "github_source_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Nullable until account→workspace binding exists; owner is authoritative. */
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    /** Stable internal/Clerk user id — the consent owner. */
    ownerUserId: text("owner_user_id").notNull(),
    composioSessionId: text("composio_session_id").notNull(),
    composioConnectedAccountId: text("composio_connected_account_id"),
    authConfigId: text("auth_config_id").notNull(),
    githubLogin: text("github_login"),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("uq_gh_src_conn_session").on(t.composioSessionId),
    index("ix_gh_src_conn_owner").on(t.ownerUserId),
    index("ix_gh_src_conn_status").on(t.ownerUserId, t.status),
  ],
);

export const githubRepoSources = pgTable(
  "github_repo_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => githubSourceConnections.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    ownerUserId: text("owner_user_id").notNull(),
    repoId: text("repo_id").notNull(),
    fullName: text("full_name").notNull(),
    defaultBranch: text("default_branch").notNull(),
    /** Immutable commit SHA captured at selection — the recorded revision. */
    commitSha: text("commit_sha").notNull(),
    repoMeta: jsonb("repo_meta"),
    /** Cached source-only recon result; regenerated per selection. */
    reconResult: jsonb("recon_result"),
    reconAt: timestamp("recon_at", { withTimezone: true }),
    selectedAt: timestamp("selected_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_gh_repo_src_connection").on(t.connectionId),
    index("ix_gh_repo_src_owner").on(t.ownerUserId),
  ],
);
