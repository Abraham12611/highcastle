# Contributing to HighCastle

HighCastle is an original, evidence-first security product. Read `AGENTS.md`, `docs/00_INDEX.md` and `docs/security/02_CONTAINMENT_AND_AUTHORIZATION.md` before making changes.

## Branch and PR process
- Base on owner-designated integration branch (not automatically main), feature branch `feature/lXX-topic`.
- Follow lane ownership in `docs/delivery/02_PARALLEL_WORKSTREAMS.md`.
- No simultaneous schema, contracts, root package or security-policy edits without approval from owner.
- Conventional commit messages.
- PR documents what is truly implemented, tests actually run, and any security implications.
- Never submit copied Sandchest assets, AGPL-derived code, or sensitive credentials.

## Definition of done
Validations and unit tests pass; tenant authorization and scope enforced; safety-sensitive code has negative tests; UI handles empty/error/inconclusive states; tested execution evidence is real, not mocked in deployed path. Contract/API/migration changes are documented. See `docs/delivery/04_INTEGRATION_AND_QA.md`.

## Authorized testing only
Do not use HighCastle to scan other people's public sites, create unrestricted exploit scripts, or deploy untrusted code on the Vultr host. Hackathon test target is intentionally vulnerable synthetic lab. Report possible vulnerabilities responsibly at `SECURITY.md`.

## Workspace conventions (foundation, lane L01)

- pnpm workspace: `apps/*` and `packages/*`. A new package needs a `package.json` named `@highcastle/<name>` and joins automatically — no root edits.
- Depend on sibling packages with `"@highcastle/<name>": "workspace:*"` and consume the package's declared exports; do not reach into `src` via relative paths.
- Shared toolchain versions (typescript, vitest, eslint, tsx, prettier, @types/node) are pinned once in the `catalog:` block of `pnpm-workspace.yaml` — reference them as `"pkg": "catalog:"`.
- Every package exposes the same script names where they apply: `dev`, `build`, `lint`, `typecheck`, `test`. Root `pnpm -r` scripts pick them up automatically.
- TypeScript strict everywhere; extend `tsconfig.base.json` and set only module-specific options (`module`, `moduleResolution`, `jsx`, `lib`, `paths`).
- `test:e2e`, `test:security` and `db:migrate` are reserved placeholders that fail closed until their owning lanes land the real implementations — do not make them exit 0 without real checks.
- Example for L03: create `packages/contracts/package.json` (`@highcastle/contracts`, exports pointing at built or source entry per agreed convention), then `apps/web`/`apps/worker` add `"@highcastle/contracts": "workspace:*"`.

## Current status
Repository foundation implemented by lane L01 (pnpm workspace, Next.js web shell, worker shell, CI). Other lanes build on it per `docs/delivery/02_PARALLEL_WORKSTREAMS.md`.
