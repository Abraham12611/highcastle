# Lablab.ai Submission Pack — COORDINATOR REVIEW ONLY

> Do not submit without coordinator/owner release confirmation.
> Deadline: **2026-11-09 00:00 WAT** (owner-authorized; re-check dashboard).
> Every E2E-dependent field below is marked with its proof status.

## Project title

HighCastle — prove the risk, prove the fix

## Short description (draft)

Your personal AI hacker: HighCastle turns a security hypothesis into a
narrowly scoped, executable check against an owned, disposable test app —
records what actually happened, explains the fix, and replays the exact
test after the patch. Built on Vultr.

## Long description (draft)

Vibe coding ships apps at AI speed; verification lags behind. HighCastle
is an AI-assisted application-security platform for builders and
developers that does not just warn — it proves.

Connect an owned target, freeze an authorized scope, and HighCastle's
investigation loop runs: Vultr Serverless Inference proposes a structured
security hypothesis; a deterministic policy gate approves the plan; a
disposable Docker sandbox runner executes baseline plus security checks
against our synthetic invoice lab; an independent oracle (never the
model) sets the verdict; the finding ships root cause plus a copyable fix
prompt; and the identical pack re-runs against the patched revision to
prove the repair. Out-of-scope actions are denied at runtime, logged, and
the runner is destroyed with verified cleanup.

Hackathon scope is exactly one vulnerability class — broken object
authorization on the owned synthetic lab (`bola-invoice-v1`) — with
synthetic Alice/Bob fixtures only. No third-party scanning, no crawling,
no pentesting of arbitrary hosts. Anything unmerged is labelled planned,
not shipped.

## Tags (draft)

AI security, Vultr, proof-based testing

## Links (fill at submit time)

- Public demo URL: https://high-castle.online (`/` + `/demo` HTTP 200
  verified 2026-11-08; full signed-out UX proof owed by E4, issue #73)
- Public repo URL: PENDING owner visibility flip (after secret sweep)
- Demo video URL: PENDING recording (storyboard:
  `docs/delivery/demo-assets/video-storyboard.md`)
- Architecture: `docs/delivery/demo-assets/architecture.md`
- Source revision: README + video + demo must all cite the deployed SHA
  (approved baseline `1252234` via PR #84; deployed-SHA confirmation owed
  by E3, issue #73)

## Cover image

Original HighCastle art only (pixel-fortress mark, Nocturne Signal
tokens). No copied or AGPL sources.

## Setup instructions (reproducible, synthetic lab only)

```bash
corepack enable
pnpm install
pnpm build
pnpm dev                 # web :3000, worker :3010/healthz
```

```bash
DATABASE_URL="<server-only url>" pnpm --filter @highcastle/db db:migrate
```

Server-only env names (never values): `DATABASE_URL`,
`BETTER_AUTH_SECRET`, `VULTR_INFERENCE_API_KEY`,
`VULTR_INFERENCE_MODEL`, `HIGHCASTLE_APP_URL`, `DEMO_TARGET_BASE_URL`.

## What is proven vs pending (must match README + video)

Proven live 2026-11-07: Vultr Serverless Inference `glm-5.3-flash`
hypothesis, schema-valid, request IDs / latencies / tokens on file, no
model substitution, timeout safe-failure. See `evidence-checklist.md`.

Pending issue #73: scan→oracle BOLA on vulnerable revision, containment
denial, patched replay `verified_fixed`, runner cleanup, full UX path,
video, signed-out link verification, secret sweep of final artifacts.

## Screenshots

Existing captures in `docs/delivery/demo-assets/l07/` — E4 to review for
secrets/PII and retake on the deployed SHA if UI drifted. Sign-in /
onboarding shown only if genuinely working; otherwise the proven
synthetic demo path carries the video.
