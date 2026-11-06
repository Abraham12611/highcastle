# HighCastle Documentation — Master Index

**Status:** canonical planning documents. Date: 2026-11-06. This is a hackathon execution specification, not a statement of shipped functionality.

## How to use the pack

- Start with `../AGENTS.md`. Do not code from screenshots alone.
- The **hackathon implementation boundary** is `product/03_SCOPE_AND_SUCCESS.md`. Other features are explicitly future design targets, not tasks for the weekend.
- Cross-links are stable relative paths. Route IDs (U01–U19), agent IDs (A01–A13), modal IDs (M01–M60), and task lane IDs (L01–L20) are the canonical references across files.
- Preserve the previous conversation's major distinctions: Builder vs Developer, Source vs Target, evidence confidence vs severity vs remediation state, application containment vs execution narrative, and fix+replay as the outcome.
- Any conflicting implementation detail: ADR + security rules override visual or product speculation.

## Product
- [01_PRODUCT_OVERVIEW](product/01_PRODUCT_OVERVIEW.md) — positioning, conceptual loop, objects, principles.
- [02_ICPS_AND_PERSONAS](product/02_ICPS_AND_PERSONAS.md) — 5 ICPs, Builder/Developer modes, jobs-to-be-done.
- [03_SCOPE_AND_SUCCESS](product/03_SCOPE_AND_SUCCESS.md) — exact MVP, out-of-scope, measurement and gates.
- [04_FEATURE_CATALOG](product/04_FEATURE_CATALOG.md) — Sandchest-derived patterns versus original innovation; staged features.

## Experience (full product architecture; only marked H is a current build target)
- [01_USER_FLOWS](experience/01_USER_FLOWS.md) — all 19 parent flows and master map.
- [02_ONBOARDING_AND_CONNECTION_FLOWS](experience/02_ONBOARDING_AND_CONNECTION_FLOWS.md) — U01–U05 expanded.
- [03_SCAN_FINDINGS_REMEDIATION_FLOWS](experience/03_SCAN_FINDINGS_REMEDIATION_FLOWS.md) — U06–U10 expanded.
- [04_SUPPORTING_AND_EDGE_FLOWS](experience/04_SUPPORTING_AND_EDGE_FLOWS.md) — U11–U19, failure and recovery.
- [05_SITEMAP](experience/05_SITEMAP.md) — full nested routes for landing, app, operations.
- [06_SCREEN_SPECS](experience/06_SCREEN_SPECS.md) — screen-by-screen layout, actions and states.
- [07_MODALS_AND_OVERLAYS](experience/07_MODALS_AND_OVERLAYS.md) — complete M01–M60 registry.
- [08_NAVIGATION_STATES_AND_ACCESS](experience/08_NAVIGATION_STATES_AND_ACCESS.md) — cross-flow navigation and authorization.
- [09_UX_COPY_AND_CONTENT](experience/09_UX_COPY_AND_CONTENT.md) — screen microcopy, consent, failed/inconclusive messages.

## Design
- [01_DESIGN_SYSTEM](design/01_DESIGN_SYSTEM.md) — **original** midnight-cyber palette, typography, spacing, status, data viz, responsive/a11y.
- [02_ART_DIRECTION_AND_ASSETS](design/02_ART_DIRECTION_AND_ASSETS.md) — pixel logo and illustration briefs, page composition, anti-copy rules.
- [03_WIREFRAMES_AND_COMPONENTS](design/03_WIREFRAMES_AND_COMPONENTS.md) — original page wireframes, component ownership and mobile adaptations.

## Architecture
- [01_SYSTEM_OVERVIEW](architecture/01_SYSTEM_OVERVIEW.md) — modules, boundaries, workflows.
- [02_TECH_STACK_ADR](architecture/02_TECH_STACK_ADR.md) — choices/alternatives, Better Auth, Supabase vs Coolify, Vultr leverage.
- [03_DATABASE_SCHEMA](architecture/03_DATABASE_SCHEMA.md) — entities, columns, indexes, migration discipline.
- [04_RELATIONSHIPS_AND_STATES](architecture/04_RELATIONSHIPS_AND_STATES.md) — FK graph, scan/finding/project state machines.
- [05_API_CONTRACTS](architecture/05_API_CONTRACTS.md) — endpoint shapes, Zod contracts, errors, idempotency.
- [06_EVENTS_AND_JOBS](architecture/06_EVENTS_AND_JOBS.md) — async events, retries, lifecycle, event streaming.
- [07_VULTR_DEPLOYMENT](architecture/07_VULTR_DEPLOYMENT.md) — VM, managed DB, optional Coolify, inference, networking, cost.
- [08_AUTH_AND_GITHUB](architecture/08_AUTH_AND_GITHUB.md) — Better Auth, RBAC, future GitHub App.

## Agents
- [01_AGENT_FLOWS](agents/01_AGENT_FLOWS.md) — full A01 parent pipeline and A02–A13 specialized subflows.
- [02_TEST_PACK_AND_VERIFICATION](agents/02_TEST_PACK_AND_VERIFICATION.md) — test pack, independent oracle, replay and artifacts.

## Security
- [01_THREAT_MODEL](security/01_THREAT_MODEL.md) — risks and mitigations for an AI security product.
- [02_CONTAINMENT_AND_AUTHORIZATION](security/02_CONTAINMENT_AND_AUTHORIZATION.md) — critical execution boundary.
- [03_DATA_HANDLING](security/03_DATA_HANDLING.md) — credentials, redaction, evidence retention, auditing.

## Delivery (hackathon only)
- [01_HACKATHON_PLAN](delivery/01_HACKATHON_PLAN.md) — phase gates, critical path, timebox, schedule.
- [02_PARALLEL_WORKSTREAMS](delivery/02_PARALLEL_WORKSTREAMS.md) — 20 AI-engineer lanes and ownership.
- [03_ISSUE_CARDS](delivery/03_ISSUE_CARDS.md) — execution-ready acceptance criteria.
- [04_INTEGRATION_AND_QA](delivery/04_INTEGRATION_AND_QA.md) — merges, contracts, tests, break-glass recovery.
- [05_DEMO_SCRIPT_AND_SUBMISSION](delivery/05_DEMO_SCRIPT_AND_SUBMISSION.md) — judged demo, contingency, checklist.

## Quality and contributor workflows
- [01_TEST_MATRIX](quality/01_TEST_MATRIX.md) — automated and live acceptance matrix.
- [Contributing](../CONTRIBUTING.md), [Security policy](../SECURITY.md), [PR template](../.github/PULL_REQUEST_TEMPLATE.md) and [MIT license](../LICENSE).

## Decisions and sources
- [01_ADRS](decisions/01_ADRS.md)
- [02_RISKS_AND_OPEN_QUESTIONS](decisions/02_RISKS_AND_OPEN_QUESTIONS.md)
- [01_SOURCES_AND_INSPIRATION](references/01_SOURCES_AND_INSPIRATION.md)

## Canonical reference IDs
- U01–U19: user/product flows.
- A01–A13: orchestrator and agent/system sub-flows.
- M01–M60: modal/overlay registry.
- L01–L20: independent engineering workstreams.
- H/B/L/E: hackathon / private beta / public launch / expansion.

## Product interaction invariant
`Connect → Authorize → Investigate → Prove → Explain → Fix → Replay → Monitor`. All displayed numbers must come from stored observations, never a fake 'live' demo stream.
