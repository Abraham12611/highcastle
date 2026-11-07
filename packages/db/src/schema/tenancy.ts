import { index, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { experienceMode, workspaceRole } from "./enums.js";

/**
 * Tenancy tables.
 *
 * `owner_user_id` / `user_id` reference Better Auth users, whose tables are
 * generated and owned by L05 (`apps/web` auth). This package stores the IDs
 * as plain UUIDs with NO foreign key into auth tables, so auth migrations
 * stay single-owner. Every repository call in this package still filters by
 * `workspace_id` — membership is the tenant boundary.
 */

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  ownerUserId: uuid("owner_user_id").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    role: workspaceRole("role").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index("ix_workspace_members_user").on(t.userId),
  ],
);

export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id").primaryKey(),
  experienceMode: experienceMode("experience_mode").notNull().default("builder"),
  timezone: text("timezone"),
  accessibleDisplaySettings: jsonb("accessible_display_settings")
    .notNull()
    .default(sql`'{}'::jsonb`),
});
