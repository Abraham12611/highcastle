# Demo Video Storyboard — 2–4 Minutes

**Gate: record only after issue #45 (E2E) passes on the deployed Vultr URL,
from the merged `develop` SHA the judges will see.** Until then this is a
shooting plan, not footage. If the live run degrades on camera, fall back
to a previously recorded *actual* run with an on-screen
“recorded <date>” label — never a simulated or narrated-over fake.

Target length 3:10. All lab data is synthetic (Alice/Bob) and labelled so
on screen.

| # | Time | Shot | Narration (abridged) | Evidence on screen |
|---|---|---|---|---|
| 1 | 0:00–0:20 | Landing page → “controlled demo” entry | “HighCastle is your personal AI hacker: it doesn’t just warn, it safely reproduces the flaw, explains the fix, and replays the proof.” | Public URL bar; banner: owned synthetic lab |
| 2 | 0:20–0:45 | Demo project “Invoice SaaS”: scope card, Alice/Bob fixtures, target revisions | “Everything tested is ours: an isolated invoice app with two synthetic users and a fixed scope.” | Scope hash, fixture version, revision digests |
| 3 | 0:45–1:05 | Launch assessment; model hypothesis event in live timeline | “The plan comes from real Vultr Serverless Inference — model `glm-5.3-flash`, structured hypothesis, recorded request ID.” | Inference event with provider/model/request ID/latency |
| 4 | 1:05–1:40 | Runner spawns; baseline Alice→own invoice OK; Alice→Bob’s invoice returns Bob’s data; oracle confirms | “Baseline passes, the cross-account read leaks, and the independent verifier — not the AI — confirms it.” | Sanitized request/response, oracle assertions, attempt ID |
| 5 | 1:40–2:05 | Containment probe: runner attempts out-of-scope egress/host path; denial + policy event; runner destroyed, cleanup verified | “Escape attempts are denied by the runtime, logged, and the runner is destroyed — with proof, not promises.” | Deny rule, containment event, cleanup record |
| 6 | 2:05–2:35 | Finding detail: impact, code path, copyable fix prompt | “Here’s what it means, where it is, and the exact prompt to fix it.” | Finding linked to attempt + evidence |
| 7 | 2:35–3:00 | Replay vs patched revision: Alice→Bob denied, Alice→own OK; verdict `verified_fixed` side by side | “Same test, patched app: attack blocked, legitimate access works.” | Replay ID, before/after evidence, verdict |
| 8 | 3:00–3:10 | Architecture diagram + Vultr services + repo link | “Vultr VM, Vultr inference, isolated execution — prove the risk, prove the fix.” | `architecture.md` diagram, public links |

## Evidence tie-in (fill from `evidence-checklist.md` on shoot day)

| Shot | Evidence field to show on screen |
|---|---|
| 3 | provider, `responseModel` == requested model, request ID, latency, tokens |
| 4 | scan ID, attempt IDs, sanitized request/response, oracle assertions |
| 5 | containment event ID, deny rule, runner ID + cleanup proof |
| 6 | finding ID linked to attempt + redacted evidence |
| 7 | replay ID, `verified_fixed`, side-by-side evidence digests |
| 8 | deployed `develop` SHA, public URL |

## Recording checklist

- Signed-out browser; 1080p; system audio + voiceover each verified.
- No secrets, keys, tokens, VM IPs, or credentials visible in any frame.
- Every claim timestamped to the deployed SHA; keep the raw recording.
- Captions file; “synthetic demo data” label on lab footage.
- Upload unlisted → verify playback → link in lablab.ai submission.
