import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { projects, targets } from "./projects.js";
import { workspaces } from "./tenancy.js";

/**
 * Builder (URL-only) onboarding persistence: issued ownership challenges,
 * explicit permitted-path consents, and strictly-passive recon runs with
 * their observations. Recon artifacts are metadata-only — no page bodies,
 * no cookies, no secrets are ever stored.
 */

export const siteVerificationMethod = pgEnum("site_verification_method", ["dns-txt", "well-known"]);

export const siteVerificationStatus = pgEnum("site_verification_status", [
  "pending",
  "verified",
  "failed",
  "expired",
  "unreachable",
]);

export const passiveReconStatus = pgEnum("passive_recon_status", [
  "running",
  "completed",
  "partial",
  "failed",
  "quota_limited",
  "unreachable",
]);

/** One issued challenge per target (re-issuing rotates the token). */
export const siteVerifications = pgTable(
  "site_verifications",
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
      .references(() => targets.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    status: siteVerificationStatus("status").notNull().default("pending"),
    method: siteVerificationMethod("method"), // method that succeeded
    dnsRecordName: text("dns_record_name").notNull(),
    dnsTxtValue: text("dns_txt_value").notNull(),
    wellKnownUrl: text("well_known_url").notNull(),
    wellKnownExpectedBody: text("well_known_expected_body").notNull(),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    issuedBy: uuid("issued_by").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
  },
  (t) => [
    index("ix_site_verifications_target").on(t.targetId, t.status),
    index("ix_site_verifications_workspace").on(t.workspaceId),
  ],
);

/** Explicit user consent + the permitted public path list. Rows are never
 * deleted — revocation sets `revokedAt` so the audit trail survives. */
export const sitePermissions = pgTable(
  "site_permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    targetId: uuid("target_id")
      .notNull()
      .references(() => targets.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").notNull(),
    allowedPaths: text("allowed_paths").array().notNull(),
    consentVersion: text("consent_version").notNull(),
    consentText: text("consent_text").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by"),
  },
  (t) => [
    index("ix_site_permissions_target").on(t.targetId, t.revokedAt),
    index("ix_site_permissions_workspace").on(t.workspaceId),
  ],
);

export const passiveReconRuns = pgTable(
  "passive_recon_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    targetId: uuid("target_id")
      .notNull()
      .references(() => targets.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id").references(() => sitePermissions.id, {
      onDelete: "set null",
    }),
    runBy: uuid("run_by").notNull(),
    status: passiveReconStatus("status").notNull().default("running"),
    requestCount: integer("request_count").notNull().default(0),
    bytesReceived: integer("bytes_received").notNull().default(0),
    limitations: jsonb("limitations").notNull().default([]),
    errorCode: text("error_code"),
    errorDetail: text("error_detail"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("ix_passive_recon_runs_target").on(t.targetId, t.startedAt),
    index("ix_passive_recon_runs_workspace").on(t.workspaceId),
  ],
);

export const passiveReconObservations = pgTable(
  "passive_recon_observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => passiveReconRuns.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // tls|security_headers|cookie|http_status|redirect|dns|metadata|limitation
    name: text("name").notNull(),
    observed: boolean("observed").notNull(),
    detail: text("detail"),
    severity: text("severity").notNull().default("informational"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ix_passive_recon_obs_run").on(t.runId)],
);

export type SiteVerification = typeof siteVerifications.$inferSelect;
export type NewSiteVerification = typeof siteVerifications.$inferInsert;
export type SitePermission = typeof sitePermissions.$inferSelect;
export type NewSitePermission = typeof sitePermissions.$inferInsert;
export type PassiveReconRunRow = typeof passiveReconRuns.$inferSelect;
export type PassiveReconObservationRow = typeof passiveReconObservations.$inferSelect;
