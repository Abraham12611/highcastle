import { fileURLToPath } from "node:url";
import path from "node:path";
import { migrate as migrateNodePg } from "drizzle-orm/node-postgres/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import type { NodeDatabase, PgliteDb } from "./client.js";

/**
 * Migration runner.
 *
 * Applies the immutable journal in `drizzle/` (tracked in
 * `drizzle/meta/_journal.json`). Drizzle records applied entries in
 * `__drizzle_migrations`, so re-running is a safe no-op — the second run
 * applies zero statements. Destructive migrations require owner review
 * (AGENTS.md); this package only ever adds tables/columns/indexes.
 */

function migrationsFolder(): string {
  // src/migrate.ts -> dist/migrate.js mirrors layout, so ../drizzle is the
  // package's drizzle/ dir in both tsx-dev and built output.
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "drizzle");
}

/** Apply pending migrations to a production (node-postgres) database. */
export async function migrateNodeDb(db: NodeDatabase): Promise<void> {
  await migrateNodePg(db, { migrationsFolder: migrationsFolder() });
}

/** Apply pending migrations to an in-process PGlite test database. */
export async function migratePgliteDb(db: PgliteDb): Promise<void> {
  await migratePglite(db, { migrationsFolder: migrationsFolder() });
}

export { migrationsFolder };
