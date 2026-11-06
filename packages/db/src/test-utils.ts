import { sql } from "drizzle-orm";
import { createPgliteDb, createDb, type Database } from "./client.js";
import { migrateNodeDb, migratePgliteDb } from "./migrate.js";
import { createEnvironment, createProject, createTarget, verifyTarget } from "./repos/projects.js";
import { createAuthorizationScope } from "./repos/scopes.js";
import { createWorkspace } from "./repos/workspaces.js";

/**
 * Integration-test backend selection.
 *
 * - Default: PGlite (the genuine PostgreSQL engine, in-process). No server,
 *   no network, deterministic in CI.
 * - `HIGHCASTLE_TEST_BACKEND=pg`: real PostgreSQL server via
 *   `HIGHCASTLE_TEST_DATABASE_URL` (or PG* socket defaults for local runs).
 *
 * Both backends apply the same immutable `drizzle/*.sql` journal, so the
 * suite proves migration correctness on the real engine either way.
 */
export type TestBackend = "pglite" | "pg";

export function testBackend(): TestBackend {
  return process.env["HIGHCASTLE_TEST_BACKEND"] === "pg" ? "pg" : "pglite";
}

export function testDatabaseUrl(): string {
  const url = process.env["HIGHCASTLE_TEST_DATABASE_URL"];
  if (url) return url;
  const socket = process.env["PGHOST"] ?? `${process.env["HOME"] ?? ""}/pgsock`;
  const port = process.env["PGPORT"] ?? "5433";
  const user = process.env["PGUSER"] ?? "dev";
  const database = process.env["PGDATABASE"] ?? "highcastle_test";
  // `localhost` keeps the string URL-parseable; the `host` query parameter
  // takes precedence in node-postgres and points at the socket directory.
  return `postgresql://${user}@localhost:${port}/${database}?host=${socket}`;
}

export interface TestDb {
  db: Database;
  backend: TestBackend;
  close: () => Promise<void>;
  reset: () => Promise<void>;
}

/** Tables in dependency order for a full wipe (FK-safe via CASCADE). */
const TRUNCATE_TABLES = [
  "audit_events",
  "containment_events",
  "evidence_artifacts",
  "runner_instances",
  "test_attempts",
  "agent_proposals",
  "model_calls",
  "scan_events",
  "finding_occurrences",
  "finding_history",
  "remediations",
  "replays",
  "findings",
  "scans",
  "authorization_scopes",
  "test_identities",
  "targets",
  "environments",
  "projects",
  "workspace_members",
  "user_preferences",
  "workspaces",
] as const;

export interface FixtureChain {
  ownerId: string;
  workspaceId: string;
  projectId: string;
  environmentId: string;
  targetId: string;
  scopeId: string;
  scopeHash: string;
}

let fixtureCounter = 0;

/**
 * Minimal authorized tenant graph: workspace → project → environment →
 * target (+verified) → active scope. Deterministic per call via a suffix.
 */
export async function createFixtureChain(db: Database): Promise<FixtureChain> {
  const n = (fixtureCounter += 1);
  const ownerId = `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const ws = await createWorkspace(db, {
    slug: `fixture-${n}`,
    name: `Fixture ${n}`,
    ownerUserId: ownerId,
  });
  const project = await createProject(db, {
    workspaceId: ws.id,
    slug: `project-${n}`,
    name: `Project ${n}`,
    kind: "demo",
    createdBy: ownerId,
  });
  const env = await createEnvironment(db, {
    workspaceId: ws.id,
    projectId: project.id,
    label: `env-${n}`,
    kind: "attack_twin",
    currentRevision: `rev-${n}`,
    fixtureVersion: "1.0.0",
  });
  const target = await createTarget(db, {
    workspaceId: ws.id,
    projectId: project.id,
    environmentId: env.id,
    label: `target-${n}`,
    canonicalOrigin: "https://target-lab.highcastle.local",
    targetKind: "demo",
  });
  await verifyTarget(db, ws.id, target.id, {
    method: "synthetic_lab_attestation",
    verifiedBy: ownerId,
  });
  const scope = await createAuthorizationScope(db, {
    workspaceId: ws.id,
    projectId: project.id,
    targetId: target.id,
    actorUserId: ownerId,
    allowedHosts: ["target-lab.highcastle.local"],
    allowedPaths: ["/invoices"],
    allowedTestPackIds: ["bola-invoice-v1"],
    allowedMethods: ["GET"],
    maxDurationSeconds: 120,
    maxRequests: 8,
    maxConcurrency: 2,
    maxMemoryMb: 512,
    permittedEnvironmentId: env.id,
    expiresAt: new Date("2030-01-01T00:00:00.000Z"),
  });
  return {
    ownerId,
    workspaceId: ws.id,
    projectId: project.id,
    environmentId: env.id,
    targetId: target.id,
    scopeId: scope.id,
    scopeHash: scope.scopeHash,
  };
}

/**
 * Create a migrated, isolated test database. Call `reset()` between tests.
 *
 * The `pg` backend provisions a FRESH database per caller (name derived from
 * pid + randomness) so parallel test files never share state or contend on
 * migration locks; the database is dropped on `close()`.
 */
export async function createTestDb(): Promise<TestDb> {
  const backend = testBackend();
  if (backend === "pg") {
    const { Pool } = await import("pg");
    const baseUrl = new URL(testDatabaseUrl());
    const dbName = `hc_test_${process.pid}_${Date.now().toString(36)}${Math.floor(
      Math.random() * 0xffffff,
    ).toString(36)}`.slice(0, 60);
    const adminUrl = new URL(baseUrl);
    adminUrl.pathname = "/postgres";
    const admin = new Pool({ connectionString: adminUrl.toString() });
    await admin.query(`CREATE DATABASE "${dbName}"`);
    await admin.end();
    const fileUrl = new URL(baseUrl);
    fileUrl.pathname = `/${dbName}`;
    const { db, close } = createDb({ connectionString: fileUrl.toString() });
    await migrateNodeDb(db);
    return {
      db,
      backend,
      close: async () => {
        await close();
        const janitor = new Pool({ connectionString: adminUrl.toString() });
        await janitor.query(`DROP DATABASE IF EXISTS "${dbName}"`);
        await janitor.end();
      },
      reset: async () => {
        await db.execute(
          sql.raw(
            `TRUNCATE ${TRUNCATE_TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`,
          ),
        );
      },
    };
  }
  const { db, close } = await createPgliteDb();
  await migratePgliteDb(db);
  return {
    db,
    backend,
    close,
    reset: async () => {
      // PGlite runs one connection: sequential truncates are exact.
      for (const table of TRUNCATE_TABLES) {
        await db.execute(sql.raw(`TRUNCATE "${table}" CASCADE`));
      }
    },
  };
}
