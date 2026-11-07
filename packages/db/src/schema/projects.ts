import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import {
  environmentKind,
  projectKind,
  projectLifecycle,
  provisionStatus,
  targetKind,
  targetState,
  targetVerificationMethod,
  testIdentityRole,
} from "./enums.js";
import { workspaces } from "./tenancy.js";

/**
 * Project / source / target layer.
 *
 * A repository source (GitHub install) and an authorized test target exist
 * independently — no foreign key ties a target to a source, and no GitHub
 * install can ever proxy for target authorization (spec § Consistency).
 * GitHub-backed `project_sources` are a Beta deliverable and live outside
 * this migration; the H demo pins immutable `current_revision` strings.
 */

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    kind: projectKind("kind").notNull().default("demo"),
    lifecycle: projectLifecycle("lifecycle").notNull().default("draft"),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("uq_projects_workspace_slug").on(t.workspaceId, t.slug),
    index("ix_projects_workspace_lifecycle").on(t.workspaceId, t.lifecycle),
  ],
);

export const environments = pgTable(
  "environments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    kind: environmentKind("kind").notNull(),
    currentRevision: text("current_revision").notNull(),
    fixtureVersion: text("fixture_version").notNull(),
    provisionStatus: provisionStatus("provision_status").notNull().default("provisioning"),
    networkProfileId: text("network_profile_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    destroyedAt: timestamp("destroyed_at", { withTimezone: true }),
  },
  (t) => [index("ix_environments_project").on(t.projectId)],
);

export const targets = pgTable(
  "targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    environmentId: uuid("environment_id").references(() => environments.id, {
      onDelete: "set null",
    }),
    label: text("label").notNull(),
    canonicalOrigin: text("canonical_origin").notNull(),
    targetKind: targetKind("target_kind").notNull().default("demo"),
    state: targetState("state").notNull().default("draft"),
    verificationStatus: text("verification_status"),
    verificationMethod: targetVerificationMethod("verification_method"),
    verifiedBy: uuid("verified_by"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verificationExpiresAt: timestamp("verification_expires_at", {
      withTimezone: true,
    }),
  },
  (t) => [index("ix_targets_project_state").on(t.projectId, t.state)],
);

export const testIdentities = pgTable(
  "test_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environments.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    role: testIdentityRole("role").notNull(),
    synthetic: boolean("synthetic").notNull().default(true),
    fixtureSubjectId: text("fixture_subject_id").notNull(),
    /**
     * Opaque server-side credential handle (e.g. `ref:synthetic:alice_session`).
     * NEVER a cookie, token, or password value — the controller resolves the
     * handle at execution time and the value never touches this database.
     */
    credentialSecretRef: text("credential_secret_ref"),
    active: boolean("active").notNull().default(true),
  },
  (t) => [index("ix_test_identities_environment_role").on(t.environmentId, t.role)],
);
