# Page & Screen Specifications (H implementation with future extension)

All screens use original HighCastle design tokens in `../design/01_DESIGN_SYSTEM.md`, not Sandchest's amber/chest graphics. Source data and evidence must be real or conspicuously labelled synthetic example.

## Shared shell
**Desktop ≥1024px:** max-width ~1440 main, optional 240px navigation, 64px top bar, project breadcrumb, right-aligned CTA. **Tablet 768–1023:** narrow/collapsible nav, fewer columns. **Mobile <768:** header + accessible nav drawer, stacked cards, responsive tables via explicit horizontal scroll or card adaptation, 44px touch targets.
Top bar: fortress mark, workspace picker, global search (future), help/docs, notification bell (future), mode toggle, profile.
Status surfaces use text+icon+color. Screen reader announces async state changes via polite live region; critical policy block assertive and focus-managed.
Global states: loading skeleton, empty, no permission, disconnected source, queued, running, partial, failed, canceled, rate/quota blocked, unavailable evidence.

## H-01 Landing
**Goal:** explain real verified execution before asking user to connect anything.
Sections: compact utility nav; hero with original pixel rampart artwork; headline 'Your personal AI hacker'; 2 CTAs 'Try controlled demo' and 'Get started'; side-by-side verified failure/fix evidence; how it works (connect/authorize/prove/replay); Builder vs Developer; safety/containment explanation; original contrast palette; FAQ; footer with docs, acceptable use, source note.
Primary CTA → /demo. Secondary → sign up. Avoid 'scan any website' input. Mobile hero art does not bury CTA. Real product claims link to trace demo.

## H-02 Sign in / Quick start
GitHub sign in or guest demo. If oauth unavailable, guest may use public demo without account; never claim registered workspace. Return-to route validated. Loading, provider denied, expired state, session already exists. Use proper product artwork, no fake security statistics.
H first-run can default to an isolated demo workspace, clearly marked synthetic. Personal workspace creation becomes B if necessary.

## H-03 Workspace Overview
Header, project count, real scan count, verified findings, open findings, active scan banner, 'New assessment' CTA, recent scan activity, 'Needs attention', project list. Demo metrics derived from DB. If no scans: empty state with start scan. Reconnect live active scan via ID. Click row → scan/finding/project route. Clicking a high issue never opens an arbitrary generic dashboard.

## H-04 Project Overview
Name, application type, synthetic-demo ribbon, source snapshot ID, target test environment, verification badge, coverage, recent attempts/findings, available test packs and CTA. 'Configure' opens scope page; no ability to alter demo target to arbitrary URL. A failed preflight displays next action and disables run.

## H-05 New Assessment
Compact stepper: type (Targeted Authorization), environment (preselected owned lab), test pack, synthetic identities, limits, scope summary, confirm. First time user sees one-sentence explanation of each step. CTA POST /api/v1/scans with idempotency key. After accepted, navigate /live. Error handling: 403 policy denied, 409 duplicate, 429 quota, 503 unavailable. Confirmation shows exact target and allowed actions.

## H-06 Live Investigation — signature screen
Header: scan ID, status/elapsed/target/source revision, Cancel. Main pane: chronological event timeline; each step has phase, attempt ID, timestamps, proposed action vs executed result vs verifier outcome, evidence links. Right panel: phase progress, verified findings, sandbox resource/containment status, synthetic identities.
Tabs: Activity / Investigation / Evidence / Sandbox / Findings / Logs. Timeline automatically follows only when user hasn't scrolled; reconnect from Last-Event-ID. Display 'waiting for Vultr inference', 'sandbox starting', 'test executing' based on actual events, never demo timers.
Events are durable DB records; browser refresh reloads them. Failed step shows reason and bounded retry affordance. Cancel presents M27 and actual backend cleanup state.

## H-07 Scan Results
Run outcome (completed/partial/failed), duration, source/target/test revision, count of attempted vs verified checks, zero-findings caveat, actual finding list, containment moment card, live artifact links, run-again CTA. Report includes no claim about untested attack classes.
Use separate panels 'What model hypothesized', 'What sandbox executed', 'What verifier observed'. Evidence URLs protected and redacted.

## H-08 Finding Detail
**Builder summary:** "Alice could retrieve Bob's private synthetic invoice." Explain privacy consequence in precise hypothetical language.
**Developer proof:** CWE-639/BOLA contextual classification, target revision, source code if available, test identities, baseline check, attempted cross-account request, observed response, verifier assertion, attached artifacts.
Tabs Overview, Attack path, Proof, Replay, Fix. Details show confidence, severity and remediation separately. Avoid providing real secrets; synthetic only. Fix action → prompt panel. Replay action → M42 / replay page.

## H-09 Fix & Replay
Top: existing finding and exact initial test. Two columns / stacked on mobile: Before (vulnerable revision; attempted unauthorized read returned protected synthetic invoice) and After (patched revision; access denied, legitimate own invoice accessible).
CTA 'Run verification' launches a **new** sandbox job; initial result persists separately. Show both negative security assertion and positive functionality assertion with exact evidence. If failed, offer revised fix guidance; if inconclusive, do not close issue. Only when both assertions pass, mark 'Verified fixed' and record new occurrence.

## Future core screens
| Screen | Components | Primary action | Stage |
|---|---|---|---|
| Project list | Search/filter, exposure, last scan, status | Add project | H limited/B |
| Source | Repo, branch/SHA, recon | Reinspect | B |
| Verified targets | URLs, proof, environment, authorization | Add target | B/L |
| Threat map | Routes, roles, trust boundaries, attention | Investigate | B |
| Scan index | All/recon/deep/PR/fix tabs, filters | Open scan | H limited |
| Findings index | Severity/status/confidence, filters, rows | Open finding | H limited |
| Remediation queue | Assigned issues, pending replays | Verify fix | B |
| Automation | PR policy, schedules, gate rules | Enable | B |
| Reports | Manager/technical templates, history | Generate | B |
| Integrations | GitHub installations, status, docs | Connect | B |
| Workspace settings | Roles, policy, billing, evidence retention | Save | B/L |
| Personal settings | Mode, sessions, notifications | Save | B/L |
| Internal ops | Jobs, workers, kill actions | Inspect/stop | H internal |

## Shared component specs
- `StatusBadge`: text, icon, tone from separate semantic state enum; never color-only.
- `SeverityMeter`: 4 small stacked bars + label; *not* identical Sandchest motif; alternate original fortress/radar accent geometry.
- `PhaseTimeline`: events sorted sequence with reconnect resume, collapse, a11y.
- `EvidenceCard`: immutable artifact type/hash, redaction label, source attempt.
- `ScanStatusHeader`: enum values, deterministic progress, cancellation.
- `SourceSnapshotPill`: short SHA plus copy.
- `TargetScopePanel`: allowed host, path, packs, test identities and expiry.
- `BeforeAfterAssertion`: side-by-side actual outcome with positive baseline.
- `CommandCodeBlock`: copy, line numbers and keyboard focus.
- `EmptyState`: honest absence, next permitted action.
- `ModalFrame`: focus trap, ESC handling except explicit safety-sensitive confirmation, restore focus after close.

## Detailed states / microcopy
- Queued: 'Waiting for an available isolated runner.'
- Inference planning: 'HighCastle is proposing a test. Execution remains subject to policy.'
- Blocked scope: 'This operation was rejected by the execution boundary.'
- Inconclusive: 'We couldn't establish the outcome from the available evidence.'
- Completed no finding: 'No issue was reproduced in the checks run. Other vulnerabilities may remain.'
- Fix verified: 'The original test no longer reproduces and authorized access still works.'
- Demo indicator: 'Controlled test app with synthetic users and records.'
- Offline: 'Connection lost. Scan status will be restored from the server.'

## IA layout alternatives
A compact horizontal nav for desktop is valid, but do not copy Sandchest's pixel-by-pixel composition. Prefer a brand-specific left rail on authenticated pages; hero/marketing has a different, large asymmetrical grid. Public demo uses its own narrow top demo banner stating controlled data.
