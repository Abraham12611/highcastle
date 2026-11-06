# HighCastle

**Your personal AI hacker — finding vulnerabilities, safely proving them in isolated test environments, and verifying the fixes.**

> Status: architecture and hackathon specification; the application has not yet been implemented. All sample findings are synthetic. Product security claims must be supported by executed evidence.

HighCastle is a web-based application-security investigation platform for vibe coders, AI-assisted developers, indie founders and eventually teams. The differentiator is the **Proof Engine**: source-aware security hypotheses are translated into narrowly scoped, executable checks against an authorized, disposable test application. HighCastle records what actually happened, explains it, prepares fix guidance, and replays the original check after a patch.

## Where to begin

1. **[AGENTS.md](AGENTS.md)** — mandatory rules and entry point for all coding agents.
2. **[Documentation index](docs/00_INDEX.md)** — every product, architecture, UX, and delivery document.
3. **[Hackathon build plan](docs/delivery/01_HACKATHON_PLAN.md)** — the dependency-gated work sequence.
4. **[Parallel workstreams](docs/delivery/02_PARALLEL_WORKSTREAMS.md)** — ownership of up to 20 independent agent lanes.
5. **[Safety boundary](docs/security/02_CONTAINMENT_AND_AUTHORIZATION.md)** — non-negotiable authorization and isolation controls.
6. **[Design system](docs/design/01_DESIGN_SYSTEM.md)** — original HighCastle visual identity inspired by retro-technical interfaces, not a Sandchest copy.

## Hackathon scope (November 6–8, 2026)

The release candidate must demonstrate: an actual Vultr-hosted web application, central control plane on a Vultr VM, LLM calls through Vultr Serverless Inference, real sandboxed code/browser execution, a deterministic cross-account authorization failure against our own synthetic invoice SaaS, an evidence-backed finding, fix guidance, replay against a patched version, and at least one real sandbox containment event. See `docs/delivery/05_DEMO_SCRIPT_AND_SUBMISSION.md`.

**Not hackathon commitments:** arbitrary production pentesting; URL-wide crawling; automatic GitHub PR gates; payments; enterprise auth; unsupervised exploit generation; self-hosted custom GPU models.

## Repository layout (target; bootstrap phase creates it)

~~~text
apps/
  web/                 Next.js App Router: landing, dashboard, API, Better Auth
  worker/              background orchestrator and scan event publisher
  target-lab/          deliberately vulnerable and patched test SaaS; synthetic data
packages/
  contracts/           Zod schemas, API and event types, enums
  db/                  Drizzle schema, migrations, repositories
  ui/                  HighCastle UI primitives/tokens
  security/            authorization, scope validation, secret redaction
  inference/           Vultr Serverless Inference adapter
  test-packs/          deterministic security test pack definitions
  sandbox/             sandbox controller and execution adapters
infra/
  docker/              sandbox/target images, compose files
  vultr/               provisioning/deployment scripts
docs/                  canonical specifications
.github/workflows/     CI
~~~

Do not mistake the target layout for already-created source files. The initial documentation PR is intentionally documentation-only.

## Product principles

- **Authorization before action.** Possession of a URL does not grant permission to attack it.
- **Executed evidence over confident prose.** Model text never by itself confirms a vulnerability.
- **Fix + replay closes the loop.** A disappearing attack plus passing legitimate behavior is the test.
- **One platform, two modes.** Builder and Developer modes share state, routes and findings.
- **Vultr first for the event.** All agent LLM calls use Vultr Serverless Inference; the control plane and isolated execution are hosted on Vultr.
- **Original identity and independently developed code.** Sandchest is a product inspiration, not a component or UI to copy.

## Source materials

Hackathon: https://community.vultr.com/e/vultr-agent-rush-hackathon

Sandchest: https://www.sandchest.com/docs/scans (feature-reference only; observe license and originality).

The work is organized to enable many AI engineering workers, **not** to assume the competition accepts 20 human teammates.
