import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./test-utils.js";
import { migrateNodeDb, migratePgliteDb } from "./migrate.js";
import type { Database } from "./client.js";

/** Normalize `db.execute()` across drivers (both return `{ rows, ... }`). */
async function queryRows<T>(db: Database, query: ReturnType<typeof sql>) {
  const result = (await db.execute(query)) as unknown as Array<T> | { rows: Array<T> };
  return Array.isArray(result) ? result : result.rows;
}

/** drizzle-orm ≥0.36 journals in the `drizzle` schema (hash, created_at). */
const JOURNAL = sql`SELECT hash, created_at FROM "drizzle"."__drizzle_migrations" ORDER BY created_at`;

/**
 * Migration integrity on the genuine PostgreSQL engine.
 *
 * - Fresh database exposes all 26 domain tables (no drift vs schema).
 * - Re-running the journal is a safe no-op (repeatable migrations).
 * - A second migrate pass applies zero statements and keeps the journal row.
 */
describe("migrations", () => {
  let tdb: TestDb;
  beforeAll(async () => {
    tdb = await createTestDb();
  });
  afterAll(async () => {
    await tdb.close();
  });

  const EXPECTED_TABLES = [
    "workspaces",
    "workspace_members",
    "user_preferences",
    "projects",
    "environments",
    "targets",
    "test_identities",
    "authorization_scopes",
    "scans",
    "scan_events",
    "model_calls",
    "agent_proposals",
    "test_attempts",
    "runner_instances",
    "evidence_artifacts",
    "containment_events",
    "findings",
    "finding_occurrences",
    "finding_history",
    "remediations",
    "replays",
    "audit_events",
    "site_verifications",
    "site_permissions",
    "passive_recon_runs",
    "passive_recon_observations",
  ];

  it(`exposes all ${EXPECTED_TABLES.length} domain tables after migrate`, async () => {
    const rows = await queryRows<{ tablename: string }>(
      tdb.db,
      sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    );
    const names = new Set(rows.map((r) => r.tablename));
    for (const table of EXPECTED_TABLES) {
      expect(names.has(table), `missing table ${table}`).toBe(true);
    }
  });

  it("records the journal and re-running is a no-op", async () => {
    const before = await queryRows<{ hash: string; created_at: number }>(tdb.db, JOURNAL);
    expect(before.length).toBeGreaterThanOrEqual(1);

    if (tdb.backend === "pg") {
      await migrateNodeDb(tdb.db as never);
    } else {
      await migratePgliteDb(tdb.db as never);
    }

    const after = await queryRows<{ hash: string; created_at: number }>(tdb.db, JOURNAL);
    expect(after).toEqual(before);
  });

  it("enforces the documented unique constraints", async () => {
    const uniques = await queryRows<{ indexname: string }>(
      tdb.db,
      sql`SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE 'uq\_%'`,
    );
    const names = new Set(uniques.map((r) => r.indexname));
    for (const expected of [
      "uq_projects_workspace_slug",
      "uq_scans_workspace_idempotency",
      "uq_scan_events_order",
      "uq_attempts_scan_plan_number",
      "uq_project_finding_fp",
      "uq_occurrence_attempt",
      "uq_occurrence_scan_only",
    ]) {
      expect(names.has(expected), `missing unique index ${expected}`).toBe(true);
    }
  });
});
