import {
  createDb,
  createPgliteDb,
  migrateNodeDb,
  migratePgliteDb,
  seedDemo,
  type Database,
  type DbExecutor,
} from "@highcastle/db";

/**
 * Database handles for routes.
 *
 * - Production/dev: `DATABASE_URL` (Vultr Managed Postgres or a secured VM
 *   Postgres). The pool is process-lifetime and shared via `getRequestDb()`.
 * - Tests: `createTestDb()` builds an isolated PGlite database, runs the
 *   same immutable migrations as production, and seeds the deterministic
 *   demo tenant. No external service required.
 *
 * Migrations themselves are owned by L02; this module only runs them.
 */

export class DatabaseUnavailable extends Error {
  constructor(message = "database is not configured (DATABASE_URL missing)") {
    super(message);
    this.name = "DatabaseUnavailable";
  }
}

let cached:
  | { db: Database; close: () => Promise<void>; url: string }
  | undefined;

export async function getRequestDb(): Promise<Database> {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new DatabaseUnavailable();
  if (!cached || cached.url !== url) {
    await cached?.close().catch(() => undefined);
    const created = createDb({ connectionString: url });
    // Production migrations run in the dedicated `migrate` compose service —
    // the bundled `migrationsFolder` path does not resolve inside a deployed
    // image (issue #58). Dev/test keep migrate-on-first-request (works via the
    // symlinked pnpm layout), and tests migrate explicitly via createTestDb.
    if (process.env.NODE_ENV !== "production") {
      await migrateNodeDb(created.db);
    }
    cached = { db: created.db, close: created.close, url };
  }
  return cached.db;
}

export interface TestDb {
  db: Database;
  close: () => Promise<void>;
}

/** Isolated PGlite database with migrations + demo seed applied. */
export async function createTestDb(): Promise<TestDb> {
  const { db, close } = await createPgliteDb();
  await migratePgliteDb(db);
  await seedDemo(db);
  return { db, close };
}

export type { Database, DbExecutor };
