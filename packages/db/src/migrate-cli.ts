#!/usr/bin/env tsx
/**
 * `pnpm db:migrate` — apply pending migrations to `DATABASE_URL`.
 * Exits non-zero on failure so CI/deploy scripts fail loudly.
 */
import { createDb } from "./client.js";
import { migrateNodeDb } from "./migrate.js";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  console.error("[highcastle/db] DATABASE_URL is not set; refusing to migrate.");
  process.exit(1);
}

const { db, close } = createDb({ connectionString });
try {
  await migrateNodeDb(db);
  console.log("[highcastle/db] migrations applied");
} catch (error) {
  console.error("[highcastle/db] migration failed:", error);
  process.exitCode = 1;
} finally {
  await close();
}
