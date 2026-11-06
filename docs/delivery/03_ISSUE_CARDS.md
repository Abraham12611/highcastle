# Ready-to-Assign Work Cards — L01 to L20

Every card is intentionally bounded. Coordinator should create GitHub issues from these before delegating; they are **not yet created**. A work card is complete only after tests and acceptance evidence, not when code compiles.

## Foundation cards (must complete before broad parallelism)

### L01 — Repo bootstrap / CI
**Allowlist:** root configs, `.github/workflows/*`, pnpm workspace, foundational folder stubs. **Deliver:** pinned Node/pnpm, package scripts dev/build/lint/typecheck/test/test:e2e/test:security/db:migrate, package.json workspaces, tsconfig strict, .gitignore, .env.example no secrets, CI workflow, Next.js app and worker build stubs. **Accept:** clean pnpm install, pnpm build/typecheck/test, CI on PR; import packages/contracts from web/worker without path hacks. **Avoid:** owning implementation of authentication, lab or runner.

### L02 — DB schema and persistence
**Allowlist:** `packages/db/**`. **Deliver:** Drizzle schema per docs, immutable migrations, repository CRUD helpers, tenant-scoped queries, scan/event/attempt/finding/replay transactions, seed H demo. **Accept:** clean migration and second-run idempotency, workspace isolation test, unique scan event seq, finding fingerprint upsert, database state transitions. **Avoid:** raw cookie fields.

### L03 — Shared contracts and error taxonomy
**Allowlist:** `packages/contracts/**`. **Deliver:** Zod schemas enums, API request/response and event discriminated union, LLM plan schema, runner result schema, replay verdict matrix types, safe errors and versioning. **Accept:** validation unit tests for malformed, over-scope, duplicate, unknown event. **Avoid:** direct network/DB calls.

### L04 — Security policy primitives
**Allowlist:** `packages/security/**`. **Deliver:** pure scope intersection, target/service alias allowlist, policy decisions, secret redaction, permission helpers, immutable scope hash. **Accept:** denies arbitrary host/method/pack/exceeded budget, workspace isolation helper, tests for redirect/DNS bypass policy and prompt-injected plan rejection. **Avoid:** model-only permission logic.

## F2 parallel UI cards

### L05 — Better Auth + demo onboarding
**Allowlist:** auth/onboarding routes and auth config. **Deliver:** sign-in/sign-up with genuine session if configured, guest demo path, mode choice, sample project selection, locked authorization review, error/recovery states. **Accept:** signed out cannot see private projects; guest cannot alter target; sessions/CSRF tests and no fake user. **Risk:** OAuth integration cost; fallback documented.

### L06 — HighCastle UI kit / original art
**Allowlist:** packages/ui, original brand assets. **Deliver:** tokens Nocturne Signal, original fortress pixel logo+favicon, Button, Badge, TimelineNode, EvidenceCard, empty/error states, responsive nav primitives. **Accept:** accessibility contrast, keyboard focus, responsive 390/1440 compositions, no copied Sandchest graphics, component unit snapshots.

### L07 — Public landing and demo experience
**Allowlist:** marketing/demo route components. **Deliver:** landing, truthful safety copy, hero original pixel illustration, demo entry CTA, real application route link and public demonstration banner. **Accept:** mobile responsive, CTA routes work, sample content clearly marked, no claims of completed scanning without real artifacts.

### L08 — Workspace/project dashboards
**Allowlist:** project/overview page components defined at F1. **Deliver:** H workspace and project overview, real counts from API, active scan banner, project readiness, new assessment navigation, empty/loading/error. **Accept:** every table row navigates properly; no hardcoded '10 findings' fake in deployed demo.

### L09 — Scan wizard and live view
**Allowlist:** `apps/web/src/features/scans/**` and delegated scans pages. **Deliver:** scoped scan creation, actual progress SSE timeline with reconnect, event drawers, containment/log tabs, cancellation button, accessible status. **Accept:** refresh retains progress; policy block visible; cancel reaches API; no fake timers; all states supported.

### L10 — Finding/fix/replay UI
**Allowlist:** `apps/web/src/features/findings/**`, `features/replays/**` and delegated pages. **Deliver:** list and detail, separate severity/confidence/status, proof, prompt copy, before/after verifier comparison. **Accept:** confirmed links to actual attempt and evidence, replay creates new ID, 'verified' badge only after both checks.

## F2 execution, model and backend cards

### L11 — Controlled invoice test lab
**Allowlist:** `apps/target-lab/**`. **Deliver:** one intentionally vulnerable branch/revision and one patched revision as separate images or pinned builds, fixtures Alice/Bob with known invoices, own and cross-account read API, reproducible reset/health. **Accept:** without controller: vulnerable own 200 and cross-owner data; patched own 200 and cross-owner denied; no production data/secrets.

### L12 — Vultr inference integration
**Allowlist:** `packages/inference/**`. **Deliver:** server-only API adapter, model config/env, structured hypothesis prompt, Zod normalization, bounded retries, telemetry, offline fixture **only for tests**. **Accept:** genuine Vultr call demonstration, malformed response handled, no secrets in logs, live provider shown correctly.

### L13 — Deterministic policy decision gateway
**Allowlist:** `apps/worker/src/policy/**`. **Deliver:** LLM plan → contracts → policy intersection → approved test pack request, deny/approval event, scope version checks. **Accept:** prompt injection/outside-host/tool-type refused, policy test suite, no controller invocation on rejection.

### L14 — Sandboxed execution lifecycle
**Allowlist:** `packages/sandbox/**`, `infra/docker/runner/**`. **Deliver:** trusted executor adapter, bounded container launch, restricted network, non-root, no host mounts/secrets, kill/cancel/cleanup and probe. **Accept:** allowed lab reachable; forbidden host denied by runtime; verified container destroyed on success/fail/timeout. **Risk:** critical security boundary; L19 co-review.

### L15 — BOLA test pack and oracle
**Allowlist:** `packages/test-packs/**`. **Deliver:** fixed known-invoice HTTP/Playwright test, own-account baseline, cross-owner check, deterministic verdict, sanitize evidence, replay same pack. **Accept:** vulnerable=reproduced, patched=not_reproduced, baseline-down=inconclusive; accurate version/fixture requirements.

### L16 — Worker orchestration and fix/replay
**Allowlist:** `apps/worker/src/flows/**`. **Deliver:** pg-boss scan job orchestrator, states from preparing through finalizing, Vultr hypothesis, sandbox/test pack call, verifier to finding, retry/cancel/replay, cleanup. **Accept:** idempotent scan job, persists events, no 'confirmed' on LLM output, replay updates finding only with oracle evidence.

### L17 — Streaming + event persistence
**Allowlist:** `apps/worker/src/events/**` plus exact delegated web stream route. **Deliver:** persisted scan_events with monotonic seq and event type, SSE authenticated stream, Last-Event-ID replay, reconnect, heartbeats. **Accept:** browser refresh no loss, duplicate seq dedup, cross-workspace stream denied, no chain-of-thought.

### L18 — Backend BFF endpoints
**Allowlist:** `apps/web/src/app/api/v1/**` excluding L17 stream, `apps/web/src/server/**`. **Deliver:** projects, scan create/read/cancel, attempts, findings, fix prompts, replays, evidence URL endpoints, workspace guards. **Accept:** Zod contract tests, RBAC, Idempotency-Key, errors 401/403/409/422, no arbitrary target host or client-provided verdict.

## Integration and release cards

### L19 — Vultr deployment, integration and security gate
**Allowlist:** `infra/vultr/**`, `infra/docker/deploy/**` and isolated smoke scripts. **Deliver:** Vultr VM deployment (Coolify/Compose), TLS, env/secrets, restricted networks, actual inference, runner/target/lab, clean startup and containment verification; reviews safety PRs. **Accept:** H-01 through H-12 on public Vultr URL, no leaked secrets, runtime denial logged, cleanup verified.

### L20 — E2E, demo and submission
**Allowlist:** `apps/web/e2e/**`, `docs/delivery/demo-assets/**`; README edits only after coordinator grants. **Deliver:** automated browser E2E, screenshot/video references, short narrated demo, architecture diagram/slide plan, README Vultr walkthrough, legal/limitations, submission audit. **Accept:** signed-out judge can view demo, GitHub repo public by owner decision, video clearly shows live controlled exploit, fix replay and containment, lablab submission recorded.

## PR acceptance checklist (every lane)
[ ] Only assigned paths changed.
[ ] Interfaces use current contract freeze.
[ ] No new secrets/PII; no arbitrary target execution.
[ ] Typecheck/test/lint/build successful or failures honestly documented.
[ ] Unit/integration evidence included.
[ ] All interaction states covered.
[ ] Security implications and scope explained.
[ ] No fake live UI.
[ ] Reviewer approval from contract owner when shared schema/API touched.
