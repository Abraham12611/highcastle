/**
 * @highcastle/db — PostgreSQL persistence for HighCastle (lane L02).
 *
 * - `schema/*`: Drizzle tables mirroring `docs/architecture/03_DATABASE_SCHEMA.md`
 *   with enums from `@highcastle/contracts`.
 * - `repos/*`: tenant-scoped queries, transactions, idempotency and event
 *   ordering. Every read filters by `workspace_id`; cross-tenant IDs read as
 *   missing, never as another tenant's data.
 * - `seed.ts`: deterministic demo-tenant seed (idempotent re-runs).
 * - `client.ts` / `migrate.ts`: production connection + migration runner.
 *
 * Out of scope by design (other lanes own them): Better Auth tables (L05),
 * Beta/enterprise tables — invites, project_sources, test_approvals,
 * schedules, notifications, usage, api_keys (see README) — queue internals
 * (pg-boss, L16), HTTP/SSE (L17/L18), agent execution (L14-L16).
 */

export * from "./schema/index.js";
export * from "./client.js";
export * from "./errors.js";
export * from "./repos/workspaces.js";
export * from "./repos/projects.js";
export * from "./repos/scopes.js";
export * from "./repos/scans.js";
export * from "./repos/inference.js";
export * from "./repos/attempts.js";
export * from "./repos/explanations.js";
export * from "./repos/findings.js";
export * from "./repos/audit.js";
export * from "./repos/sources.js";
export * from "./seed.js";
export { migrateNodeDb, migratePgliteDb, migrationsFolder } from "./migrate.js";
