# Parallel Engineering Orchestration — Up to 20 AI Agent Lanes

## Fundamental coordination rule
**Do not launch 20 agents against an undefined repository.** L01–L04 must establish and freeze the foundation. After F1, L05–L18 can run concurrently if they respect exclusive file ownership. L19 is integration/security commander, L20 is quality/demo producer. 20 AI engineers are workstreams; they are not 20 hackathon participant accounts.

## Roles, dependencies and exclusive ownership
| Lane | Phase | Work package | Owns files/directories (exclusive after F1) | Dependencies | Integration artifact |
|---|---|---|---|---|---|
| **L01** | F0 | Repository foundation / CI | root package files, pnpm-workspace, tsconfigs, .github/workflows | none | install/build/lint/test scripts |
| **L02** | F0 | DB and migrations | packages/db/** | L01 skeleton | schema/repositories/migrations |
| **L03** | F0 | API/event contracts | packages/contracts/** | L01 skeleton + scope agreements | Zod types and fixtures |
| **L04** | F0 | Security interface + policy | packages/security/** | L03 draft | policy API, hard caps, denials |
| **L05** | F2 | Auth and onboarding | apps/web/src/app/(auth)/**, apps/web/src/app/onboarding/**, apps/web/src/lib/auth/** | L01–04 | working demo flow/session |
| **L06** | F2 | Brand tokens and core UI | packages/ui/**, apps/web/public/brand/** | F1 tokens approved | components/fortress logo |
| **L07** | F2 | Marketing and public demo | apps/web/src/app/(marketing)/**, apps/web/src/app/demo/** | L06 interface | landing and public demo |
| **L08** | F2 | Dashboard/project UI | apps/web/src/app/app/w/**/overview/** and projects views (explicit assigned route subtree) | L03/L06 | overview and project readiness |
| **L09** | F2 | Scan wizard/live UI | apps/web/src/features/scans/** | L03/L06/L17 contract | new scan, live timeline, cancel |
| **L10** | F2 | Finding/repair UI | apps/web/src/features/findings/** and features/replays/** | L03/L06 | finding, prompt, before/after |
| **L11** | F2 | Synthetic target-lab | apps/target-lab/** | F1 fixture contract | vulnerable+patched revisions |
| **L12** | F2 | Vultr inference adapter | packages/inference/** | L03 | genuine LLM structured proposal |
| **L13** | F2 | Scope controller integration | apps/worker/src/policy/** | L04 | validated plan-to-tool gate |
| **L14** | F2 | Sandbox lifecycle/executor | packages/sandbox/**, infra/docker/runner/** | L04/L03 | restricted runner + containment |
| **L15** | F2 | Security pack/oracle | packages/test-packs/** | L03/L11 | deterministic BOLA verdict |
| **L16** | F2 | Orchestrator and replay jobs | apps/worker/src/flows/** | L12–L15 interfaces | scan/replay control |
| **L17** | F2 | Durable events & SSE transport | apps/worker/src/events/**, apps/web/src/app/api/v1/scans/[scanId]/stream/** | L02/L03 | persisted SSE with rehydrate |
| **L18** | F2 | BFF/API routes and authz | apps/web/src/app/api/v1/** excluding L17 stream, apps/web/src/server/** | L02–04 | usable API contracts |
| **L19** | F3 | Deployment/hardening/integration QA | infra/vultr/**, infra/docker/deploy/**, smoke scripts | all vertical modules | deploy + containment evidence |
| **L20** | F4 | E2E, demo, release docs | apps/web/e2e/**, docs/delivery/demo-assets/**, README final update by coordinator approval | L19 | video, screenshots, submission |

**Glob-pattern collision note:** Next.js route folders under `apps/web/src/app/app/w/**` should be explicitly allocated by concrete route prefix at F1. L08 owns overview/projects page files, L09 owns scans features/scan pages, L10 finding/replay features/pages; L18 owns HTTP route handlers only. Coordinator creates thin route entrypoint stubs or grants ownership once to prevent concurrent editing same files. L19 cannot silently edit L14 sandbox code to 'fix' deployment. Root lockfile is L01 only.

## F0 operating sequence
1. L01 creates workspace skeleton, CI, scripts, typecheck/build.
2. L03 publishes schemas and enumerations in contracts; L02 implements corresponding DB tables/migrations with test fixtures.
3. L04 defines policy validation interfaces and H allowlist.
4. Coordinator runs contract tests and one minimal scan on dev lab.
5. Publish F1 **contract freeze SHA**, branch off integration head. Only then assign L05–L18.
Substantial cross-package interface changes require contract-change issue, coordinator acceptance, version bump and downstream PR rebase.

## Agent handoff template
Each AI engineer receives:
- Workstream lane ID and feature branch name.
- Canonical docs: AGENTS.md, product/03, architecture/03 & 05, security/02, lane-specific design/flow spec.
- Exact allowlist paths and files they must not touch.
- Frozen API types and seed fixture IDs.
- Acceptance criteria and tests to run.
- Mock vs production adapter flag restrictions.
- A known integration commit SHA.
- Required PR format and definition of done.

## Parallel batch schedule (dependency-aware)
**Batch F0:** L01 foundation first; L02, L03, L04 coordinate contracts, no mass parallel coding.
**Batch F1 spike:** L11 target-lab + L12 inference + L14 sandbox + L15 test pack can each spike against frozen interfaces (small test code allowed). Coordinator proves first end-to-end path.
**Batch F2A:** L05–L10 UI; L13 policy integration, L16 orchestration, L17 event transport, L18 API in parallel with stable types.
**Batch F2B:** integration adapters meet in isolated branch; L19 verifies infra; L20 runs E2E/gathers footage.
After first full user path succeeds, adding secondary features is prohibited until submission artifacts done.

## PR workflow / review gates
- One branch per lane from designated integration head: `feature/l09-live-scan` etc.
- No direct commit to main. If `develop` does not exist, coordinator creates dedicated integration branch; don't assume.
- Each PR modifies only allocated paths. Conflict with shared contracts → stop and request coordinator.
- Require pnpm lint, typecheck, unit tests, build; feature-specific test and screenshot/log proof.
- Mock adapter cannot accidentally be production default. Distinct test fixtures and flags, no fake confirmation in live route.
- Security-sensitive PRs require L04/L19 review; DB changes require L02; interface changes L03; UI tokens L06.
- Merge one dependency class at a time; smoke test after each class.
- Choose squash merges with conventional title and link acceptance evidence.

## Communication protocol
- Agent begins with `SCOPE: lane, allowed paths, dependencies, expected deliverable, proof plan`.
- Agent PR includes `DONE: interfaces used, commits, tests run, known gaps, security implications`.
- Coordinator sends contract changes as explicit versioned notes; no surprises.
- Use one issue/ticket per lane and per critical integration defect. Avoid duplicated agents editing same file.

## Budgeting compute and attention
20 agents writing code simultaneously can exhaust review/inference/CI budgets and integration bandwidth. Limit actual concurrently merged PRs, ensure foundation owner can review, and cap runner tests to one at a time on Vultr. Run local tests for UI lanes with fake adapters; only integration lane uses real Vultr deployment for acceptance. Synthetic fixed data avoids contention.

## Coordination success measures
- Zero unauthorized cross-file edits.
- Every PR has passing contract tests and a named reviewer.
- One authoritative DB schema, event union and source of truth.
- Same BOLA oracle passes from package test and deployed runner.
- No unreviewed security boundary changes.
- Demo artifacts produced from merged deployed commit.
