# Hackathon Execution Plan — Foundation → Parallel → Integrate → Prove

**H-only scope.** Planning date Nov 6, 2026; supplied brief says submissions end Nov 9 00:00 West Africa Time. Verify official timer. This is an execution plan for a team of human coordinators assisted by up to **20 coding AI agents**; the competition's human team limit still applies.

## Goal and critical path
A deployed original HighCastle UI demonstrates: Vultr-hosted control plane → actual Vultr Serverless Inference hypothesis → constrained policy gate → isolated actual authorization test against owned synthetic invoice lab → independent evidence-backed BOLA finding → fix prompt → patched replay (unauthorized denied, legitimate allowed) → real containment event and cleanup. Every parallel stream serves this thread.

**Critical path:** F0 repo foundation → F1 contract freeze and lab/inference feasibility → F2 parallel lanes → F3 integrated runtime → F4 proof, hardening, recording → F5 submission. Never develop high-risk generic scanners, payments or enterprise settings in H.

## Phase F0 — Foundation (sequential, blocking)
Owner/coordinator L01 establishes monorepo scaffold, Node/pnpm versions, lint/typecheck/test/build scripts, workspace boundaries, CI, branch conventions and .env.example. L02 owns DB schema/migrations and seed isolation; L03 owns Zod contracts, events/errors and endpoint signatures; L04 owns threat-model and sandbox controller interface, operator hard caps, auth/scope rules.
**Gate F0 done:** clean install, scripts callable, migrations run on clean Postgres, project builds, typed contracts published, security boundary reviewed, no unapproved secrets in repo. Future engineers do not modify shared foundation without owner authorization.

## Phase F1 — Contracts frozen + first vertical proof
Before assigning 14 parallel lanes:
- Fix `ScanRequest`, `ScanEvent`, `TestAttemptResult`, `VerificationVerdict`, `Finding`, `Replay` and `ContainmentEvent` Zod schemas.
- Fix DB enums, IDs, timestamps, cursor strategy and evidence storage protocol.
- Fix scope/policy allowlist and runner request format.
- Fix design tokens and route map.
- Establish synthetic target-lab credential and revision contract.
- Prove one minimal runtime vertical slice on **Vultr**: real inference structured reply + one policy-approved runner request + real response from owned lab + stored event.
**Gate F1 done:** contract tests and minimal vertical slice pass; coordinator tags freeze snapshot or records commit. This is more important than multiple screenshot-only dashboards.

## Phase F2 — Parallel implementation (14 independent coding lanes)
After F1, L05–L18 independently implement assigned modules using frozen contracts. Each lane has own feature branch and ownership map in `02_PARALLEL_WORKSTREAMS.md`. Mock adapters allowed only behind typed interfaces and explicit test-only flags; no fake live scan output in integrated build.
Suggested synchronous coordination: a short contract status update after each batch of PRs, regular integration smoke tests, and no silent edit to shared root files.

## Phase F3 — Vertical integration (L19 security/infrastructure, coordinator)
Merge in dependency order:
1. DB/contracts/security and test lab, inference adapter.
2. Runner/controller + deterministic oracle.
3. Orchestrator + queue/events + authenticated API.
4. Web shell + live scan + finding + replay.
5. Deployment + hardening + evidence exports.

Use the exact acceptance list `product/03_SCOPE_AND_SUCCESS.md`. On each merge, run typecheck/test/build; on major integrations run real E2E with Vultr model and sandbox. Test cancel and retries. Freeze design changes that risk evidence correctness.

## Phase F4 — Rehearsal, polish and proof
Run **3 controlled end-to-end rehearsals** against deployed app. Include:
- actual model request metadata;
- actual actor Alice→Alice baseline;
- actual Alice→Bob unauthorized read on vulnerable target;
- independent oracle confirmation;
- prompt and patch explanation;
- patched replay with denial+positive baseline;
- containment deny from runtime;
- container destroyed, evidence persisted.
Capture video while it works, prepare a backup recording and real stored artifacts. Explain limitations honestly. L20 owns demo/submission assets; L19 verifies runtime security.

## Phase F5 — Submit
Before supplied deadline: GitHub repo public (requires owner action if private), license compatibility and no leaked secrets; README architecture instructions, public demo URL, demo video/slide deck, lablab.ai submission; Vultr service usage documented. Verify links from a signed-out browser. No reliance on optional Vultr Community showcase as submission.

## Milestone / dependency chart
~~~mermaid
flowchart LR
 F0[Foundation L01-L04] --> F1[Schema + API + policy freeze]
 F1 --> UI[UI L05-L10]
 F1 --> ENG[Lab/inference/policy/execution L11-L16]
 F1 --> STR[Events + API L17-L18]
 UI --> F3[Integration L19]
 ENG --> F3
 STR --> F3
 F3 --> F4[Full rehearsal + QA]
 F4 --> F5[Demo + submission L20]
~~~

## What is NOT worth shipping in H
- Fancy hacker avatar customization.
- Real GitHub PR webhooks/automatic merge checks.
- Arbitrary-user URL scanning or custom code execution.
- CVE/advisory pipeline.
- Billing, plans, credits, team invites and enterprise controls.
- Model swarm and self-hosted abliterated GPUs.
- Generic 'scan 100 OWASP classes' claim.
- Visual polish that takes resources away from real safe execution.

## Progress tracker template
| Gate | Owner | Evidence needed | State |
|---|---|---|---|
| F0 repo | L01 | clean pnpm build/typecheck | not started |
| F0 DB | L02 | migrations + seed tests | not started |
| F0 contracts | L03 | Zod tests/schema version | not started |
| F0 safety | L04 | enforced policy and scope tests | not started |
| F1 vertical | L11–L16 + coordinator | real Vultr/lab/runner event | not started |
| F2 UI | L05–L10 | routes+screens+states | not started |
| F2 events/API | L17–L18 | persistent SSE/idempotency | not started |
| F3 integration | L19 | live deployed E2E | not started |
| F4 submission | L20 | video/repo/demo/lablab | not started |

**Status values in docs must be manually updated from actual PR/tests**, not presumed done after planning.

## Contingency priorities
If inference unreliable: select another Vultr-supported model; keep structured known test-pack constrained. If browser image too heavy: Node HTTP pack still executes genuine code; visuals can show actual request log. If Coolify unstable: Compose on Vultr VM. If auth late: public controlled sample demo, no unprotected privileged internal APIs. If time tight: drop marketing flourishes and second test class, never drop isolation, verification or submission.
