# Hackathon Submission Checklist (L20)

Target: complete well before **2026-11-09 00:00 WAT**. Nothing here is
merged to `main` and the repo is not made public without the owner’s
explicit approval.

## 1. Final acceptance — all must be observed, not assumed

- [x] Real Vultr Serverless Inference call: `glm-5.3-flash`, structured
      proposal valid, no substitution (`evidence-checklist.md`).
- [x] Request IDs, latencies, token counts recorded.
- [x] Timeout safe-failure proven live (`code=timeout`).
- [ ] Public URL loads in a signed-out browser (pending L19 / #45).
- [ ] Scan → policy-approved plan → runner → oracle-confirmed BOLA on the
      vulnerable revision, with baseline passing (pending #45).
- [ ] Real containment event: out-of-scope action denied at runtime,
      logged with runner/policy IDs (pending #45).
- [ ] Patched replay: cross-account denied + own-access passes, verdict
      `verified_fixed`, original attempt immutable (pending #45).
- [ ] Runner destroyed and cleanup verified; no orphans (pending #45).
- [ ] Full landing → demo → scan → finding → fix → replay UX path
      (pending #45).
- [ ] Video recorded from the deployed SHA per `video-storyboard.md`.
- [ ] Video, README, and demo all reference the same deployed SHA.

## 2. lablab.ai submission fields

- [ ] Project title, short + long description, tags (AI security, Vultr,
      proof-based testing — final wording with coordinator).
- [ ] Cover image (original HighCastle art only, no copied assets).
- [ ] Demo video link (playback verified from a signed-out session).
- [ ] Public GitHub repo URL (**owner makes public explicitly**; verify no
      secrets in history before flipping visibility).
- [ ] Public hosted demo URL (Vultr VM backend, not marketing-only).
- [ ] Architecture + Vultr services documented (see `architecture.md` and
      README “How it’s built on Vultr”).
- [ ] Containment moment present in the video.
- [ ] Submission confirmed on lablab.ai; official rules re-checked.
- [ ] Team list complies with the event’s human team-size rules.

## 3. Publication safety gates (owner approval required)

- [ ] Owner approves making the GitHub repo public.
- [ ] Owner approves any `main` merge.
- [ ] Secret sweep clean: no keys, tokens, VM credentials, CI logs with
      secrets, or credential files in repo, video, or screenshots.
- [ ] README claims match deployed, observed behavior only.
- [ ] License compatibility confirmed (MIT-compatible, original assets).

## 4. Link verification (external machine, signed-out)

- [ ] Public URL loads with no login.
- [ ] Repo URL resolves publicly with README rendering (diagram included).
- [ ] Video plays without permission prompts.
- [ ] lablab.ai entry lists all three links correctly.
