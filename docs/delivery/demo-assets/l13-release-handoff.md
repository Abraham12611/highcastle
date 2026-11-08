# ENGINEER 13 — Final Release Materials Handoff (2026-11-08)

## 1. Closing time — owner action required
- I have **no authorized lablab.ai participant-dashboard access** from this lane, so I **cannot verify the exact closing timestamp**.
- Working target from brief + gate #33: **2026-11-09 00:00 WAT (unconfirmed)** — do NOT treat as the official cutoff.
- **Owner action:** open lablab.ai → event "Vultr Agent Rush" → participant dashboard → submission deadline field, paste the exact timestamp + timezone into `docs/delivery/06_SUBMISSION_CHECKLIST.md` §6, then check that box.

## 2. Submission checklist status (source: `docs/delivery/06_SUBMISSION_CHECKLIST.md`)
- Proven live: Vultr Serverless Inference `glm-5.3-flash`, structured proposal valid, request IDs / latencies / tokens on file, timeout safe-failure (`code=timeout`). See `docs/delivery/demo-assets/evidence-checklist.md`.
- Pending issue #45 / gate #33 (needs deployed E2E on Vultr URL): public URL load, scan→oracle BOLA, containment denial, patched replay `verified_fixed`, runner cleanup, full UX path, video from deployed SHA, SHA agreement across video/README/demo.
- Publication gates untouched per instructions: repo stays private, no `main` merge, no submission — all await owner approval.

## 3. README
- Canonical draft: `docs/delivery/demo-assets/README-draft.md` — **do NOT copy over root `README.md` without coordinator agreement** (issue #46 overwrite risk).
- Draft correctly labels every undeployed claim PENDING (public URL, E2E replay, video, submission) and separates proven-live inference evidence from pending items. Env vars listed by name only, no values.
- Root `README.md` still describes target layout honestly. No action until E2E passes.

## 4. Architecture explanation
- Canonical: `docs/delivery/demo-assets/architecture.md` (Challenge 1: VM control plane + Vultr Serverless Inference for all agent LLM calls + disposable runners + independent oracle; six enforced data-flow rules; mermaid diagram).
- README "How it's built on Vultr" table matches it. No drift found.

## 5. Recording storyboard + required sequence
- Canonical: `docs/delivery/demo-assets/video-storyboard.md` (8 shots, ~3:10). Record **only after #45 passes on the deployed SHA**; degraded live run → fall back to a labelled recorded actual run, never a fake.
- Required shot order: (1) public Vultr-hosted URL + synthetic-lab banner → (2) Invoice SaaS scope/Alice/Bob/revisions → (3) real Vultr inference hypothesis event (model/request ID/latency) → (4) disposable sandbox run: baseline OK + cross-account leak + oracle confirm → (5) real containment denial + policy event + destroy/cleanup proof → (6) finding detail + fix prompt → (7) patched replay side-by-side `verified_fixed` → (8) architecture + links + deployed SHA.
- Show the project dashboard only if functioning; never fake functionality for screenshots.

## 6. Source / evidence links (all in-repo)
- Checklist: `docs/delivery/06_SUBMISSION_CHECKLIST.md`
- Storyboard: `docs/delivery/demo-assets/video-storyboard.md`
- Evidence (live values only): `docs/delivery/demo-assets/evidence-checklist.md`
- Architecture: `docs/delivery/demo-assets/architecture.md`
- Release commands: `docs/delivery/demo-assets/release-commands.md`
- Vultr API reference: `docs/delivery/demo-assets/vultr-api-reference.md`
- Screenshots: `docs/delivery/demo-assets/l07/` (review for secrets/PII; retake on deployed SHA if drifted)
- Demo script + truth ledger: `docs/delivery/05_DEMO_SCRIPT_AND_SUBMISSION.md`

## 7. Agreement + safety verification (this turn)
- SHA note: HEAD `7784a27` vs `develop` `5652cac` — video/README/demo **must all cite the deployed `develop` SHA after #45**, not today's HEAD.
- Secret sweep: `grep -riE` for `sk-`, `api[_-]?key\s*[:=]`, `Bearer`, private keys over demo-assets + README + AGENTS → only placeholder names (`<server-only key>`, `[REDACTED]`, bare var names). **Clean.** Video-frame check still owed at recording time.
- No unsupported claims introduced: every pending item stays labelled PENDING; synthetic data labelling required on screen.
- Coordination: L20 owns E2E/video capture (issue #45, F4); L13 owns these materials. Handshake point is gate #33 — L13 fills SHA/URL/IDs from L20's deployed run, then owner submits.
