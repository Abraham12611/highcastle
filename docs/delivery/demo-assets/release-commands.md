# Release Commands — Placeholder Review and Owner Coordination (L20)

Root `package.json` keeps three commands as **fail-closed placeholders**
(`scripts/not-implemented.mjs`, exit 1 by design). This document records
what the real commands are, who owns wiring them, and what is missing.
**No root script is changed here** — wiring needs L01 (repo foundation)
plus each owning lane and coordinator approval. A green no-op shim is
explicitly forbidden: it would masquerade as a passing gate.

## `pnpm db:migrate` → owner L02 (+ L01 for root wiring)

- Real command exists: `pnpm --filter @highcastle/db db:migrate`
  (`tsx src/migrate-cli.ts`, needs server-only `DATABASE_URL`).
- Also available: `pnpm --filter @highcastle/db db:generate`
  (drizzle-kit, schema changes) and `test:pg` (Postgres-backed tests
  with `HIGHCASTLE_TEST_BACKEND=pg`).
- Proposed root wiring (NOT applied): delegate to the package command.
  Pending: L02 confirms the migrate CLI is release-ready; L01 approves
  the root delegation.

## `pnpm test:security` → owners L04 + L14/L15 (+ L01 for root wiring)

- Real, runnable suites already exist per package:
  - `pnpm --filter @highcastle/security test` (scope policy, budgets,
    redaction, URL policy),
  - `pnpm --filter @highcastle/sandbox test` (controller, docker args,
    envelope, policy),
  - `pnpm --filter @highcastle/test-packs test` (manifest, oracle,
    replay, redaction).
- No single composed gate exists yet. Proposed root wiring (NOT
  applied): run the three package suites above. Pending: L04/L14/L15
  confirm their suites are the release gate; L01 approves composition.
  Docker-dependent sandbox integration tests need a Docker host and
  must be labelled as such, never silently skipped as green.

## `pnpm test:e2e` → owner L20/F4 (this lane), needs deployed app

- No Playwright suite exists yet (`apps/web/e2e/` absent). The E2E
  suite and its fixtures are an F4 deliverable on the deployed Vultr URL
  (issue #45), not a script rename.
- Until then the placeholder MUST keep failing closed. Do not wire it
  to unit tests or to an empty Playwright config.

## Operator commands verified today

```bash
pnpm install          # frozen lockfile, all workspaces
pnpm build            # topological: contracts → dependents
pnpm lint             # per-package ESLint
pnpm typecheck        # per-package tsc --noEmit
pnpm test             # per-package Vitest (unit, hermetic)
DATABASE_URL="<server-only url>" pnpm --filter @highcastle/db db:migrate
VULTR_INFERENCE_API_KEY="<server-only key>" \
VULTR_INFERENCE_MODEL="<live catalog model id>" \
HIGHCASTLE_RUN_LIVE_SMOKE=1 \
pnpm --filter @highcastle/inference smoke
```

Values are never committed; only variable names appear in docs and CI.
