# HighCastle Hackathon Demo Script, Evidence and Submission Checklist

## The story
'Vibe coding makes it easy to ship apps. HighCastle gives builders a personal AI hacker that **doesn't just warn them**: it safely reproduces a security flaw in an isolated environment, explains how to fix it and replays the exact test to prove the repair.'

## Recommended 2.5–4 minute narrative (flexible, don't overclaim timings)
1. **Hook (0:00)** Landing: 'Your personal AI hacker' and one-click controlled demo. Explain that this is synthetic lab, not a third-party live app.
2. **Connect (0:20)** Open demo project 'Invoice SaaS' with authorized lab, Alice and Bob test users, exact scope and revisions.
3. **Plan (0:40)** Launch targeted authorization assessment; point out **actual Vultr Serverless Inference** model and structured hypothesis/event.
4. **Execute (1:00)** Show runner created, baseline Alice reads own invoice, Alice requests Bob's known synthetic invoice; actual response arrives, independent oracle confirms cross-account leak. Display evidence trace, not just prose.
5. **Contain (1:35)** Show harmless attempted out-of-scope network/host action from inside runner; system denies it and logs enforced policy, resource limits, cleanup. Make visible no key touches sandbox.
6. **Fix (2:05)** Open Finding detail, plain-language impact, technical code path and copyable coding-agent prompt. Show patched revision or actual patch application in controlled lab.
7. **Replay (2:35)** Re-run exact test pack against updated revision; Alice denied Bob invoice but still reads her own. New attempt ID, evidence and verdict shown side by side.
8. **Wrap (3:10)** Value for founders and developers, future GitHub PR checks clearly labelled planned. Show Vultr infrastructure diagram and real app link.

## Demonstration 'truth ledger'
| Claim | Exact proof to show |
|---|---|
| AI agent planned | Vultr inference request metadata/model and structured hypothesis |
| Agent performed work | Real sandbox runner + emitted request/response evidence |
| Exploit reproduced | Fixture owner comparison + oracle assertion |
| Contained | Actual forbidden runtime action denied, policy/runner ID |
| Safe cleanup | Runner terminated and cleanup verified |
| Fix verified | Same pack after patch, security negative check + own-access baseline pass |
| Product-style app | Public URL, persistent state, detailed UI, responsive route |
| Originality | HighCastle design identity + independent test/replay mechanism |

## Live-demo contingencies
- Model response slow: use a completed **real scan history** from earlier that includes authentic model call; state clearly it is a recorded run, not pretend live.
- Runner fails: show honest failed state and a previously completed run. Do not manufacture success.
- Browser stream disconnects: refresh and show event recovery from persisted records.
- Patch operation slow: pinned known patched revision, but still run fresh replay to prove outcome. Explain revision distinction.
- Screenshots/video from sample lab must label data synthetic and redacted.

## Submit on lablab.ai
Based on supplied Vultr Agent Rush event brief, deliver:
- Project title, short and long descriptions, tags.
- Original cover image and video (and requested slides if applicable).
- Public GitHub repository with MIT-compatible original code and README.
- Public hosted demo URL (backend deployed Vultr VM).
- Vultr architecture + services clearly documented in README.
- Challenge 1 containment moment in recorded video.
- Completed official lablab.ai submission before deadline. Optional Vultr Community showcase does not replace it.
- Team participation subject to event's human team-size rules; 20 coding AI workers are not 20 human participants.

## Public README must disclose
- Architecture diagram and deployment topology.
- Actual Vultr VM/inference/sandbox use.
- Setup/env variable names without values.
- Run instructions reproducible on test lab.
- Security boundary and limited vulnerability coverage.
- Synthetic test accounts only, no arbitrary production scanning.
- Exact screenshots or snippets as evidence, not fake activity.
- License, design originality, known limitations and responsible use.

## Checklist
[ ] Actual public URL loads in signed-out browser.
[ ] No leaked secrets in repository, artifacts, source maps, logs, video.
[ ] Live inference call uses Vultr and model ID is correctly documented.
[ ] Runnable isolated execution and actual containment denial.
[ ] BOLA reproduced in vulnerable synthetic lab, positive baseline works.
[ ] Replay against patched version confirms security fix and baseline.
[ ] Evidence tied to immutable attempt/revision/scan IDs.
[ ] Runner destroyed and orphan janitor healthy.
[ ] UX works from landing→demo→scan→finding→fix→replay.
[ ] GitHub repo visibility switched to public by owner intentionally.
[ ] Video link and slides work; audio/readability verified.
[ ] Lablab submission confirmed; official rules checked again.

## Suggested presentation slide outline
1. Problem: apps shipped at AI speed.
2. HighCastle: personal AI hacker, not another code-only warning.
3. How it works: scope → Vultr inference → sandbox → oracle → replay.
4. Original safety boundary / containment evidence.
5. Real demo result (synthetic but executed).
6. Users and business value (Builder + Developer).
7. Architecture, limitations, roadmap (beta plans clearly labelled).

## Final positioning
'HighCastle is the security-testing companion for people building and shipping applications with AI: **prove the risk, prove the fix**.'
