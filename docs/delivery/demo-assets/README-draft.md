# README draft — FOR COORDINATOR REVIEW ONLY

> This file proposes polished root-README content. **Do not copy it over
> `README.md` without coordinator agreement** (overwrite risk, issue #46).
> All deployment/E2E claims below are marked pending until gate #33 passes.

---

# HighCastle — prove the risk, prove the fix

HighCastle is an AI-assisted application-security platform for builders
shipping at AI speed: vibe coders, AI-assisted developers, and indie
founders. Instead of another scanner that only warns, HighCastle turns a
source-aware security hypothesis into a **narrowly scoped, executable
check against an owned, disposable test application**, records what
actually happened, explains the fix, and **replays the exact test after
the patch** to prove the repair.

## Who it’s for

- **Builders** shipping fast with AI assistance who need proof, not
  fear — “is this real, and is it fixed?”
- **Developers** who want a copyable fix prompt grounded in their own
  code path and verified by re-execution.
- (Post-hackathon) teams wanting the same loop on every pull request.

## How it works

`Connect → Authorize → Investigate → Prove → Explain → Fix → Replay → Monitor`

1. **Scope** — human-approved target, test accounts, budgets, and
   timeouts are frozen into an immutable scan config with a scope hash.
2. **Hypothesize** — Vultr Serverless Inference proposes a structured
   security hypothesis (validated JSON, enumerated test pack only).
3. **Prove** — a deterministic policy gate approves the plan; a
   disposable sandbox runner executes the baseline and the security
   check against the synthetic invoice lab.
4. **Verify** — an independent oracle (not the model) compares observed
   fixture ownership and sets the verdict: reproduced, not reproduced,
   or inconclusive.
5. **Fix & replay** — the finding ships root cause plus a fix prompt;
   the identical pack re-runs against the patched revision.
6. **Contain** — out-of-scope actions are denied at runtime, logged, and
   the runner is destroyed with verified cleanup.

Model output can never grant itself permissions, name hosts, or set a
verdict. Every number shown comes from stored observations.

## How it’s built on Vultr (Challenge 1)

| Vultr service | Use |
|---|---|
| Cloud Compute VM | control plane: web app, worker, PostgreSQL, sandbox controller, synthetic lab |
| Serverless Inference | **all** agent LLM calls (verified live: `glm-5.3-flash`, structured hypotheses) |
| Managed PostgreSQL *or* self-hosted Postgres on the VM | durable scans, events, evidence |
| Object Storage *(optional)* | private evidence artifacts; otherwise private VM volume |

See `docs/delivery/demo-assets/architecture.md` for the diagram and
enforcement rules.

## Run the controlled demo (synthetic lab only)

Never point HighCastle at third-party hosts. The demo uses the owned
invoice lab with synthetic Alice/Bob fixtures.

```bash
corepack enable
pnpm install
pnpm db:migrate
pnpm dev
```

Server-only environment (names only — never commit values):

```dotenv
DATABASE_URL=
BETTER_AUTH_SECRET=
VULTR_INFERENCE_API_KEY=
VULTR_INFERENCE_MODEL=
HIGHCASTLE_APP_URL=
DEMO_TARGET_BASE_URL=
```

Live inference smoke (operator credentials on the server only):

```bash
VULTR_INFERENCE_API_KEY="<server-only key>" \
VULTR_INFERENCE_MODEL="<live catalog model id>" \
HIGHCASTLE_RUN_LIVE_SMOKE=1 \
pnpm --filter @highcastle/inference smoke
```

Deployment: `infra/docker/deploy/` (Compose + Caddy) and
`infra/vultr/ENVIRONMENT.md`. Public URL: **PENDING** (gate #33).

## What the demo proves (all observed, linked in docs)

- Real Vultr inference hypothesis with provider/model/request ID/latency.
- Cross-account invoice read reproduced on the vulnerable revision,
  baseline passing, oracle-confirmed.
- Runtime containment denial with policy event and verified cleanup.
- Patched replay: attack denied, legitimate access works,
  `verified_fixed`.
- Full evidence chain: scan → attempt → finding → replay IDs.

## Limitations (explicit)

- Exactly one vulnerability class: broken object authorization on the
  owned synthetic invoice lab (`bola-invoice-v1`). No general pentesting,
  no crawling, no third-party targets.
- Demo auth is a limited synthetic session; enterprise auth is out of
  scope for the hackathon.
- Video/README match the deployed `develop` SHA; anything unmerged is
  labelled planned, not shipped.

## License and originality

MIT-compatible original code and art (midnight-indigo/teal/violet/coral
tokens, original pixel-fortress mark). No Sandchest assets, no AGPL
sources. See `LICENSE` and `SECURITY.md`.
