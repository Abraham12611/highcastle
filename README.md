# HighCastle — Prove the risk. Prove the fix.

HighCastle is a containment-first AI security investigation application, built for the **Vultr Agent Rush / Blast Radius Zero** hackathon. It runs a real, bounded security check inside an isolated Docker environment on Vultr, captures verifiable observations, and independently verifies whether a patch fixes the issue.

**Live app:** [https://high-castle.online](https://high-castle.online)  
**Controlled demo:** [https://high-castle.online/demo](https://high-castle.online/demo)  
**Get started:** [https://high-castle.online/get-started](https://high-castle.online/get-started)

The public demo exercises **HighCastle's own synthetic invoice application**. It does not scan arbitrary customer URLs, connect to third-party apps, or grant a guest access to unrestricted pentesting.

## Real demo workflow

1. Open the controlled demo and grant the displayed, fixed synthetic-lab scope.
2. Vultr Serverless Inference generates a bounded security program/hypothesis; the independent policy gate checks allowed operations.
3. The worker dispatches the approved work to an ephemeral, hardened Docker sandbox on the Vultr VM (not the web/app process).
4. The sandbox exercises a vulnerable synthetic invoice app under test accounts Alice and Bob. The **independent oracle**, not the LLM, checks whether Alice can read Bob's invoice.
5. HighCastle persists the scan events, evidence digests, containment actions and finding. The UI exposes live/resumable SSE updates and remediation guidance.
6. A patched replay checks that Alice can still read her own invoice but cannot read Bob's, before marking the finding `verified_fixed`.
7. The runner is destroyed and cleanup is recorded.

A real Vultr deployment run reported on **November 8, 2026** demonstrated this chain on application revision `2380dcac`:

| Proof | Real persisted result |
|---|---|
| Vulnerable scan | `d10c63a5-8b0f-4477-9f6e-7ce35448f686` — completed |
| Original test attempt | `2783683d-ba8c-450e-8b32-e17965f1a762` — reproduced |
| Confirmed finding | `ad9a8d1c-2466-48f5-adc2-b73128cef866` — synthetic BOLA |
| Patched replay | `68d85b0c-e1c0-4cf9-a749-4ea0a338f405` — `verified_fixed` |
| Runtime | Docker runner with network/process/filesystem containment and cleanup |

These are **operator-reported live execution records**, not a claim that every later browser test or every account feature passes. See [release evidence and remaining acceptance gates](docs/delivery/06_SUBMISSION_CHECKLIST.md) and [the architecture diagram](docs/delivery/demo-assets/architecture.md). The exact public serving SHA must be rechecked after each deployment.

## Architecture

| Component | Implementation |
|---|---|
| UI and API | Next.js 16, React 19, TypeScript, original Nocturne Signal UI components |
| Control plane | Vultr Cloud Compute VM, Caddy HTTPS, Docker Compose |
| Agent model | **Vultr Serverless Inference**, OpenAI-compatible endpoint; agent calls stay server-side |
| Orchestration | Node.js worker, PostgreSQL 16, pg-boss durable jobs and scan events |
| Execution boundary | Disposable non-root Docker runners, caps dropped, read-only filesystem, scoped internal network, CPU/memory/time/request budgets |
| Verification | `bola-invoice-v1` deterministic test pack + independent evidence-based oracle |
| Storage | PostgreSQL / Drizzle, persisted evidence metadata, replay linkage and cleanup ledger |
| Accounts | Clerk integration and workspace tenancy in source; public production configuration is verified separately |

**Trust boundary:** Model-generated code never executes inside the web server or trusted worker process. It enters only the authorized container runtime, where execution and egress restrictions apply. The oracle—not the model—determines whether a finding is reproduced or fixed.

## Repository layout

- `apps/web`: landing, onboarding, dashboard, authorized demo, scan/finding/replay pages and BFF.
- `apps/worker`: durable scan/replay execution, sandbox and inference adapters, post-verdict explanation.
- `apps/target-lab`: owned synthetic invoice lab in vulnerable and patched revisions.
- `packages/sandbox`: runner controller, authorization and containment.
- `packages/test-packs`: deterministic BOLA checks and independent oracle.
- `packages/security`: policy, scope validation and safe egress primitives.
- `packages/inference`: Vultr LLM adapter.
- `packages/db`: Drizzle schemas, migrations, repositories and durable events.
- `packages/ui`: original Nocturne Signal tokens, components and fortress identity.
- `infra/docker/deploy`, `infra/vultr`: reproducible Vultr deployment instructions and examples.

## Local development

Requirements: Node.js 24, Corepack/pnpm, Docker with Compose, and a PostgreSQL database (or the documented local stack).

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```

See [environment template](.env.example) and [Vultr deployment docs](infra/vultr/ENVIRONMENT.md). Supply secrets only through local ignored env files or server-side secret configuration; **never commit keys**. A complete scan requires the database, queue, synthetic target lab, correct immutable image digest, approved scope and container runtime. Running only `pnpm dev` does not provision these dependencies.

## Explicit limitations and safety

- The hackathon demo is a **fixed, authorized synthetic BOLA test**, not a general-purpose or autonomous public bug-bounty tool.
- Source/GitHub and verified-URL onboarding are separate integration lanes; do **not** assume they are available just because UI placeholders appear.
- Clerk account authentication requires correctly configured production keys and an actual browser acceptance test; guest demo sessions are not real customer accounts.
- Never use the demo to target a real third-party website or repository without specific authorization.
- Treat the [submission checklist](docs/delivery/06_SUBMISSION_CHECKLIST.md) as a release gate; real recorded video, exact deployed SHA and evidence remain independently verifiable.

## Documentation

Start with [architecture](docs/00_INDEX.md), [hackathon implementation plan](docs/delivery/01_HACKATHON_PLAN.md), [containment and authorization](docs/security/02_CONTAINMENT_AND_AUTHORIZATION.md), [agent engineering rules](AGENTS.md), and [submission storyboard](docs/delivery/demo-assets/video-storyboard.md).

## License

See [LICENSE](LICENSE). HighCastle's original code and visual identity are distinct from Sandchest. Any future directly adapted AGPL component must go through a separate license/source-compliance review before being incorporated into the public application.
