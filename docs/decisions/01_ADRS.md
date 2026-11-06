# Architecture Decision Records — HighCastle

**Status:** proposed and accepted for **planning**, not implemented. Each ADR has owner and revision rule. If implementation differs, update ADR before changing contracts.

## ADR-001 — Project focus
**Decision:** build one bounded executable BOLA assessment against owned synthetic invoice SaaS for Challenge 1, not generalized pentesting. **Why:** reliable actual evidence and containment in days. **Rejected:** implement dozens of CVEs and random third-party URL scanning. **Consequences:** public marketing must disclose limited coverage. Owner: product/security coordinator.

## ADR-002 — One orchestrator with specialized capabilities
**Decision:** stateful worker with recon, hypothesis, test selection, verification and remediation stages; not agent swarm. **Why:** observability, constrained action space, lower integration risk. **Later:** split only if metrics justify.

## ADR-003 — Vultr inference for all H LLM calls
**Decision:** one adapter to Vultr Serverless Inference with model ID selected from current model list. No external API fallback for agent LLM calls in Challenge 1. **Why:** event requirement. **Future:** pluggable provider can be evaluated after hackathon, including self-hosted GPU if commercially sensible.

## ADR-004 — TypeScript modular monorepo
**Decision:** pnpm workspaces; Next.js web/BFF, worker, test lab, shared contracts/db/security/inference/sandbox/test-packs. **Why:** 10–20 lane parallel development with one type system. **Rejected:** rapidly assembling microservice mesh.

## ADR-005 — PostgreSQL/Drizzle + Better Auth
**Decision:** Drizzle/Postgres stores app entities; Better Auth for sessions; backend checks workspace roles. **Why:** control and portability on Vultr. **Alternative:** Supabase Marketplace Auth/DB/Storage replaces coordinated subset if founder explicitly opts in; Clerk as managed auth fallback. Avoid triple auth.

## ADR-006 — pg-boss queue
**Decision:** durable Postgres-backed background jobs, separate worker. **Why:** no Redis infrastructure during weekend. **Alternative:** BullMQ/Redis when scale or job semantics require it.

## ADR-007 — Deployment: Vultr VM with Compose or Coolify
**Decision:** web/control, worker and sandbox on Vultr VM; Coolify is optional deployment manager, Compose fallback. **Why:** sponsor fit, control. **Non-decision:** Coolify is not security isolation; cannot allow Docker socket into untrusted execution.

## ADR-008 — Known test pack + deterministic oracle
**Decision:** the LLM proposes known bounded `bola-invoice-v1`, policy validates, runner executes, oracle confirms outcome. **Why:** credible safe proof. **Rejected:** model-driven arbitrary exploit scripts against unknown targets H.

## ADR-009 — Versioned findings and replay
**Decision:** scan holds immutable scope/source/target/test pack; finding persists across scan occurrences; replay is a new run with independent assertions. **Why:** no fake 'fixed' state or stale evidence.

## ADR-010 — Two modes, one shared product
**Decision:** Builder/Developer are presentation modes only. **Why:** avoid duplicating engines and inconsistent security status.

## ADR-011 — Original visual identity
**Decision:** Nocturne Signal midnight/navy + mint/cyan + violet + coral; original fortress/pixel logo, non-copying layouts. **Why:** user likes strong Sandchest genre, but originality/license concerns mean no copied visuals or AGPL source.

## ADR-012 — Source vs target separation
**Decision:** source permission and active target authorization independently modeled; URL control proof does not imply blanket testing authority. **Why:** responsible testing/security.

## ADR-013 — No arbitrary production test target in hackathon
**Decision:** H only owned synthetic lab. **Why:** Docker-only isolation and short operational runway insufficient for hostile arbitrary source/targets. **Later:** introduce stronger isolation, authorization and enterprise controls.

## ADR-014 — Evidence truth as product contract
**Decision:** confirmed means independently observed actual behavior; inconclusive is real status; zero reproduced findings is not a secure guarantee. **Why:** avoids deceptive outputs.

## ADR-015 — Repository workflows
**Decision:** feature branches and owner-controlled integration/main, file ownership and versioned contract freeze. **Why:** collision avoidance with many AI agents. If develop branch absent, coordinator creates it before assignment.

## ADR review and modification template
~~~text
ADR-ID:
Status: proposed/accepted/superseded
Date:
Decision:
Context and options:
Security implications:
Cost and portability:
Affected contracts/files:
Migration and rollback:
Approver:
~~~
