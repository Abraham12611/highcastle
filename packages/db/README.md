# @highcastle/db — PostgreSQL persistence (lane L02)

Drizzle schema, immutable migrations, tenant-scoped repositories,
transactions and the deterministic demo seed for HighCastle.

## Layout

- `src/schema/` — Drizzle tables mirroring
  `docs/architecture/03_DATABASE_SCHEMA.md`. Enum values mirror
  `@highcastle/contracts` (`packages/contracts/src/enums.ts`); additive
  values require a contract bump + a new migration.
- `src/repos/` — repository functions. Every read filters by `workspace_id`;
  cross-tenant IDs read as missing, never as another tenant's data.
- `src/seed.ts` — deterministic demo tenant (`seedDemo()`, idempotent).
- `src/client.ts` — production `pg` Pool client + shared schema record.
- `src/migrate.ts` / `src/migrate-cli.ts` — journal runner (`pnpm db:migrate`).
- `src/test-utils.ts` — test backend selection + fixture chain (excluded
  from the published build, like `*.test.ts`).

## Conventions

- PKs are UUIDs (`gen_random_uuid()`, built-in since PostgreSQL 13 —
  no extension required). Time is `timestamptz` (UTC); the API layer
  formats ISO-8601.
- `scan_events.seq` is strictly per-scan monotonic (`unique(scan_id, seq)`).
  Writers MUST use `appendScanEvent()`, which serializes on the scan row
  and retries on unique-violation, so concurrent workers stay gapless.
- Authorization scopes are write-once: only `revokeAuthorizationScope()`
  (`active → revoked`) and `expireAuthorizationScopes()` mutate status.
  Re-authorization inserts a new versioned row; scans snapshot
  `scope_id` + `scope_hash`.
- `verified_fixed` is awarded only by `completeReplay()` from recorded
  oracle observations — `triageFinding()` rejects it at runtime and in types.
- `finding_history` and `audit_events` are append-only (no update/delete API).
- `user_id` columns are plain UUIDs with NO foreign key into auth tables:
  Better Auth tables are generated and owned by L05.
- Deferred to their lanes (NOT in migration `0001`): `workspace_invites`,
  `project_sources`, `target_verifications`, `test_approvals`,
  `github_installations`, `integration_events`, `scheduled_scans`,
  `notifications`, `usage_records`, `api_keys`, pg-boss internals.

## Commands

```bash
pnpm typecheck       # tsc --noEmit
pnpm lint            # eslint .
pnpm test            # vitest on PGlite (real Postgres engine, in-process)
pnpm test:pg          # same suite against a real PostgreSQL server
pnpm build           # tsc build to dist/
pnpm db:generate     # drizzle-kit generate (review SQL before committing)
pnpm db:migrate      # apply drizzle/ to DATABASE_URL
```

`pnpm test:pg` uses `HIGHCASTLE_TEST_DATABASE_URL`, falling back to the
`PGHOST`/`PGPORT`/`PGUSER`/`PGDATABASE` socket defaults. Each test file gets
a fresh database that is dropped afterwards.

## Environment

```bash
DATABASE_URL=postgresql://user:pass@host:5432/highcastle
```

`db:migrate` refuses to run without `DATABASE_URL` and never logs it.
