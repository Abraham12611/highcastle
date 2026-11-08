import { Pool, type PoolConfig } from "pg";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import type { NodePgDatabase, NodePgTransaction } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import type { PgliteDatabase, PgliteTransaction } from "drizzle-orm/pglite";
import * as schema from "./schema/tables.js";

/**
 * Shared schema record (tables only) for both drivers.
 *
 * Production uses node-postgres against real PostgreSQL (Vultr Managed
 * Postgres or a secured VM). Tests use the same SQL against either a real
 * server (`HIGHCASTLE_TEST_DATABASE_URL`) or PGlite, which embeds the
 * genuine PostgreSQL engine in-process — no network, no service, CI-safe.
 */
export const dbSchema = {
  workspaces: schema.workspaces,
  workspaceMembers: schema.workspaceMembers,
  userPreferences: schema.userPreferences,
  projects: schema.projects,
  environments: schema.environments,
  targets: schema.targets,
  testIdentities: schema.testIdentities,
  authorizationScopes: schema.authorizationScopes,
  scans: schema.scans,
  scanAdmissions: schema.scanAdmissions,
  scanEvents: schema.scanEvents,
  modelCalls: schema.modelCalls,
  agentProposals: schema.agentProposals,
  testAttempts: schema.testAttempts,
  runnerInstances: schema.runnerInstances,
  evidenceArtifacts: schema.evidenceArtifacts,
  containmentEvents: schema.containmentEvents,
  findings: schema.findings,
  findingOccurrences: schema.findingOccurrences,
  findingHistory: schema.findingHistory,
  remediations: schema.remediations,
  replays: schema.replays,
  auditEvents: schema.auditEvents,
};

export type DbSchema = typeof dbSchema;

export type NodeDatabase = NodePgDatabase<DbSchema>;
export type PgliteDb = PgliteDatabase<DbSchema>;

/** Repository-facing database handle: either production driver or test DB. */
export type Database = NodeDatabase | PgliteDb;

export type NodeTransaction = NodePgTransaction<DbSchema, Record<string, never>>;
export type PgliteTx = PgliteTransaction<DbSchema, Record<string, never>>;

/** Transaction handle passed to repository callbacks. */
export type DbTransaction = NodeTransaction | PgliteTx;

/** Anything a repository can read/write through (db or transaction). */
export type DbExecutor = Database | DbTransaction;

export interface CreateDbOptions {
  connectionString: string;
  max?: number;
}

export interface CreatedDb {
  db: NodeDatabase;
  pool: Pool;
  close: () => Promise<void>;
}

/**
 * Production client: node-postgres pool + Drizzle.
 * `DATABASE_URL` is the only secret-bearing input; it is never logged.
 */
export function createDb(options: CreateDbOptions): CreatedDb {
  const config: PoolConfig = {
    connectionString: options.connectionString,
    max: options.max ?? 10,
  };
  const pool = new Pool(config);
  const db = drizzleNodePg(pool, { schema: dbSchema });
  return {
    db,
    pool,
    close: () => pool.end(),
  };
}

/**
 * In-process test client (PGlite = real PostgreSQL engine, no server).
 * Migrations run through the same `drizzle/*.sql` journal as production.
 */
export async function createPgliteDb(): Promise<{
  db: PgliteDb;
  close: () => Promise<void>;
}> {
  const { PGlite } = await import("@electric-sql/pglite");
  const client = new PGlite();
  const db = drizzlePglite(client, { schema: dbSchema });
  return { db, close: () => client.close() };
}

/**
 * Run a function inside a transaction. Repositories that need atomicity
 * across tables (scan + first events, finding upsert + occurrence, replay
 * completion + finding transition) take the `tx` handle instead of `db`.
 */
export async function withTransaction<T>(
  db: Database,
  fn: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction((tx) => fn(tx as DbTransaction));
}
