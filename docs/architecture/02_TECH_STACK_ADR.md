# Tech Stack Decision — Vultr-Centered Hackathon Architecture

## Decision summary (2026-11-06)
Prefer one complete, executable workflow to assembling 5–7 hosted services. All agent LLM calls through Vultr Serverless Inference. Backend, web app, worker and isolated test execution on Vultr Cloud Compute. Choose **Coolify-on-Vultr OR Docker Compose on Vultr** for deployment; use **Vultr Managed PostgreSQL if available within credits OR self-managed Postgres on Vultr**. Do **not** simultaneously adopt Supabase Auth, Clerk and Better Auth.

## Selected stack
| Concern | Selected for H | Why | Alternative / later |
|---|---|---|---|
| Monorepo | pnpm workspaces, strict TS | shared contracts, parallel lanes | Turbo only after baseline |
| Web + API | Next.js App Router + React + TS | one UI/API/runtime | separate Fastify later if needed |
| Styling | Tailwind v4 + accessible headless primitives; own tokens | original polished design | none |
| Auth | Better Auth with Drizzle/Postgres | self-hosted, portable; own workspace | Clerk if managed auth becomes priority after event |
| Authorization | shared server-side RBAC + scope services | separate user auth from target permission | advanced ABAC later |
| DB | PostgreSQL + Drizzle | relational audit, job, dedup integrity | Vultr managed DB or local fallback |
| Jobs | pg-boss on PostgreSQL | durable retries without new Redis | BullMQ/Redis if scale warrants |
| LLM | Vultr Serverless Inference OpenAI-compatible API | mandatory Challenge 1 | provider adapter for post-event |
| Agent controller | dedicated Node/TS worker and structured Zod outputs | same language/contracts, observable | agent framework only if necessary |
| Test/browser | Node + Playwright container | real HTTP/browser work | Python module later |
| Evidence | Postgres metadata; Vultr Object Storage if provisioned | verifiable artifacts | private filesystem limited H fallback |
| Deployment | Vultr Compute VM; Docker Compose or Coolify | clear Vultr usage | Kubernetes not in hackathon |
| CI | GitHub Actions: lint/typecheck/test/build | safe integration | release pipeline later |
| Tests | Vitest, RTL, Playwright, sandbox integration | deterministic demo | load/security fuzz later |
| API | Next.js route handlers with Zod | fewer moving parts | OpenAPI generation from contracts |
| Observability | JSON logs + scan_events, health checks | reproducible demo | Prometheus/OpenTelemetry later |

## Should we use Supabase on Vultr?
**Answer:** It is a viable optional deployment option, but not needed for the core H build.
- Vultr publishes an official Supabase Marketplace App deployment guide; it packages PostgreSQL, auth/storage/functions within a VM-managed installation. It is **not automatically a fully managed SaaS** simply because it is installed from Marketplace. Operational responsibility for server, upgrades and secrets remains yours to verify.
- If team already knows Supabase and wants Auth/Storage/Realtime, it may replace Better Auth/DB/storage *together*, but this is an architecture change requiring ADR and migration plan.
- Running Supabase stack **plus Better Auth plus a separate managed Postgres** multiplies complexity under deadline.
- Preferred H: Better Auth + dedicated Postgres + optional Vultr Object Storage. Supabase Marketplace can be evaluated after MVP, not critical path.
Guide: https://docs.vultr.com/how-to-use-vultr-s-supabase-marketplace-application

## Should we use Coolify on Vultr?
**Answer:** Yes if provisioning is fast and repeatable; it is a *deployment convenience*, not a runtime security guarantee.
- Host web, worker and target-lab as independently managed Docker services, inject secrets only into web/worker, use HTTPS/TLS and environment separation.
- Runner creation must use a hardened, separately constrained controller. Never mount host Docker socket inside untrusted runner. A privileged Docker daemon/controller on VM is a sensitive host-side component; only trusted orchestration talks to it, through a narrow interface.
- If Coolify adds instability/cross-container networking confusion, use Docker Compose + Caddy on a Vultr VM. 'Maximizing Vultr' is about legitimate central infrastructure, not counting integrations.
Guides:
https://docs.vultr.com/how-to-deploy-an-application-with-vultr-coolify-marketplace-app
https://docs.vultr.com/how-to-use-vultr-s-coolify-marketplace-application

## Better Auth vs Clerk vs Supabase Auth
- **Better Auth (selected):** open-source/self-hosted, fits Next.js and Postgres, avoids extra provider account; requires secure OAuth setup, migrations, cookie/session configuration. Source: https://better-auth.com/docs/integrations/next and https://better-auth.com/docs/adapters/drizzle .
- **Clerk:** polished managed onboarding, fast but external auth dependency and less of product stack on Vultr. Reasonable fallback only if self-hosting blocks launch and owner approves.
- **Supabase Auth:** most coherent if committing to Supabase Marketplace across DB/auth/storage. Don't mix with Better Auth sessions.
- H should prefer a **public guest demo** with isolated synthetic state if production OAuth cannot be verified in time, not a fake auth flow. Privileged internal routes still restricted.

## Vultr resource selection
- **Cloud Compute VM (required):** API/control, worker, optional Compose/Coolify and lab.
- **Vultr Serverless Inference (required):** model reasoning/tool proposals, OpenAI-compatible base URL https://api.vultrinference.com/v1; model ID configurable and verified on live model list.
- **Managed Database (optional):** secure Postgres + backups, suitable if budget.
- **Vultr Object Storage (optional):** S3-compatible evidence; ensure private bucket and expiry.
- **Vultr API (optional):** provisioning/deleting throwaway instances later; Challenge 1 permits but doesn't require this. An API call to provision a VM does not inherently sandbox dangerous code.
- **Vultr GPU:** explicitly unavailable for this event; do not make abliterated/custom GPU hosting a dependency.

## Model integration
~~~ts
// Illustration only. Exact SDK/model version pinned by foundation.
const client = new OpenAI({
  baseURL: "https://api.vultrinference.com/v1",
  apiKey: process.env.VULTR_INFERENCE_API_KEY
});
const result = await client.chat.completions.create({
  model: process.env.VULTR_INFERENCE_MODEL,
  messages: [...structuredPromptMessages]
});
// Strictly validate a structured response before issuing any tool action.
~~~
- Model reasoning is not execution proof. A model refusal/error becomes an explicit partial/failed result, never substituted with fake inference.
- External models are not a workaround for mandatory H calls.

## Version policy
Don't guess 'latest' semver. Foundation owner pins a tested Node LTS, pnpm, Next.js, React, Better Auth, Drizzle, Playwright image and pg-boss version in the first lockfile. Update docs with actual versions after install. Enforce clean install in CI.

## Other deliberate omissions
No Redis/BullMQ combo unless pg-boss proven inadequate. No Vercel hosting for backend for this event. No microservice mesh, Kubernetes, custom LLM GPU, complex CI GitHub App in the hackathon. No live offensive scanner for third-party hosts.

## Decision acceptance tests
- Cold-start deployment and health endpoints on Vultr.
- All model telemetry points to Vultr serverless domain, keys server-only.
- DB migrations consistent; scan survives browser refresh and worker restart.
- Runner cannot reach control plane secrets/host filesystem/arbitrary internet.
- Demonstrated runner lifecycle and proper cleanup.
