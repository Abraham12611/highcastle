# HighCastle Screen Wireframes & Component Map

These ASCII sketches communicate **layout hierarchy and interactions**, not final art. Build visually original Nocturne Signal screens (midnight blue/mint/violet/coral), not a one-for-one Sandchest dashboard.

## W01 — Landing desktop (1440px)
~~~text
┌───────────────────────────────────────────────────────────────────────────┐
│ [pixel-rampart H] HIGHCASTLE    Why it works   Demo   Docs     [Get started] │
├───────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  YOUR PERSONAL AI HACKER               ┌────────────────────────────────┐ │
│  Prove the risk. Prove the fix.         │ ORIGINAL ISOMETRIC PERIMETER   │ │
│  Brief problem statement,              │ mint shield, violet model path,│ │
│  actual controlled-test caveat.         │ coral blocked attack attempt  │ │
│  [TRY LIVE CONTROLLED DEMO] [HOW]       └────────────────────────────────┘ │
│                                                                            │
│        INSPECT source  →  EXECUTE in sandbox  →  VERIFY with evidence       │
│                                                                            │
│  [ BEYOND A SECURITY WARNING ]          [ A TEST, NOT A GUESS ]            │
│  Actual request vs oracle proof         Patch + independent replay        │
│                                                                            │
│   BUILDER MODE          DEVELOPER MODE       SAFETY + AUTHORIZATION        │
│   [CTA]                 [CTA]                [Learn limits]                 │
└───────────────────────────────────────────────────────────────────────────┘
~~~
Narrow: stack hero message, action, illustration, three-step proof, no fixed-height video blocking CTA. Primary button mint, secondary outline cyan. Link /demo and /auth/sign-up.

## W02 — Project overview
~~~text
┌─ 240px rail ───────────┬────────────────────────────────────────────────┐
│ HC / workspace        │ Project / Invoice SaaS            [+ New scan] │
│ Overview              │ [Synthetic lab] [Authorized] [Revision: ...]  │
│ Projects              ├────────────────────────────────────────────────┤
│ Scans                 │ Coverage: BOLA v1    1 verified finding         │
│ Findings              │                                                │
│ Fix and retest        │ [Target health] [Test identities] [Scope]      │
│ Reports               │                                                │
│ Settings              │ Latest scan: completed | View evidence         │
│                       │ Timeline: ...                                  │
│                       │                                                │
│                       │ Setup/checklist / limitations                  │
└───────────────────────┴────────────────────────────────────────────────┘
~~~
Project status and target scope must not be confused. No fake risk score. Space for one high-priority action.

## W03 — Signature Live Investigation
~~~text
┌──────────────────────────────────────────────────────────────────────────┐
│ Scan #... / Invoice SaaS     Executing   elapsed     [Cancel]             │
│ Synthetic owned target · Valid scope hash · vuln image digest             │
├──────────────────────────────────────────────┬───────────────────────────┤
│ Activity | Investigation | Evidence | Logs    │ CURRENT PHASE             │
│                                              │ [planning → executing]    │
│ 01 ✓ Vultr model proposed hypothesis         │                           │
│    [expand proposal]                         │ VERIFIED SO FAR           │
│ 02 ✓ Policy validated known test pack        │ 1 suspected / 0 proved   │
│ 03 ✓ Container created; limits enforced      │                           │
│ 04 ● Alice→Alice baseline                    │ CONTAINMENT LEDGER        │
│ 05 … Alice→Bob boundary check                │ - Network: restricted     │
│ 06 … Independent oracle                      │ - Host mount: none        │
│                                              │ - Last block: none        │
│ [Reconnect status] [Event seq 17]            │                           │
└──────────────────────────────────────────────┴───────────────────────────┘
~~~
Model events violet, actual tool output cyan, verifier green/red. Clicking line opens attempt drawer. No fake animated agent thoughts.

## W04 — Finding detail
~~~text
┌────────────────────────────────────────────────────────────────────────┐
│ ← Scan results     Finding HC-F01     HIGH | CONFIRMED | OPEN           │
│ Alice can read Bob's private synthetic invoice                         │
│ Business consequence in clear plain language                          │
│ [View proof] [Copy fix prompt] [Run verification]                      │
├────────────────────────────────────────────────────────────────────────┤
│ Overview | Attack path | Proof | Replay | Fix                           │
│                                                                        │
│ EXPECTED                          OBSERVED                             │
│ Alice denied Bob invoice          Bob's synthetic invoice returned    │
│                                                                        │
│ Code reference / affected handler                                        │
│ Actual attempt ID · Oracle version · Evidence digest                    │
│                                                                        │
│ REQUIRED INVARIANT / FIX GUIDANCE                                        │
└────────────────────────────────────────────────────────────────────────┘
~~~
Severity/verification/remediation as three fields. Artifact can be downloaded only after auth and redaction.

## W05 — Replay after patch
~~~text
┌────────────────────────────────────────────────────────────────────────┐
│ Verify fix for HC-F01                                      [Run replay] │
│ Original attempt: ...        New environment: lab-v2-patched            │
├───────────────────────────────┬────────────────────────────────────────┤
│ BEFORE (VULNERABLE)           │ AFTER (PATCHED)                        │
│ Alice→Bob: protected data     │ Alice→Bob: DENIED                      │
│ Alice→Alice: allowed          │ Alice→Alice: ALLOWED                   │
│ 1 confirmed attack            │ 0 reproduced; positive control passes │
│ [proof trace]                 │ [new proof trace]                      │
├───────────────────────────────┴────────────────────────────────────────┤
│ 'Verified fixed for this attack path' / Limitations                    │
└────────────────────────────────────────────────────────────────────────┘
~~~

## W06 — Mobile and responsive
- Landing hero text/CTA then image; no horizontal overflow.
- Workspace sidebar becomes accessible drawer with close/skip and stable focus.
- Event timeline single column; phase summary collapsible bottom card.
- Finding tabs horizontal-scroll with visible active border and arrows; major evidence pane full width.
- Replay before/after becomes sequential with a sticky comparison label, preserving equal details.
- Tables become labeled rows/cards; raw code scrolls horizontally inside own container, never page.

## Component handoff
| Component | Props | State | Owner |
|---|---|---|---|
| FortressLogo | size, monochrome, label | static | L06 |
| ShellNav | workspace, active route, mode | collapsed/expanded | L06/L08 |
| ProjectStatus | readiness, revision, scope | missing/ready | L08 |
| ScanWizard | pack, scope, budget, identities | draft/submitting/error | L09 |
| ScanTimeline | events array, selected attempt | live/reconnecting/terminal | L09 |
| ContainmentLedger | entries, runner policy | empty/blocked | L09 |
| FindingHeader | severity, confidence, remediation | stateful badges | L10 |
| EvidencePanel | artifact, hash, redaction | loading/error | L10 |
| FixPrompt | guidance | copy/success | L10 |
| ReplayDiff | original, new run, assertions | waiting/running/verdict | L10 |
| ScopeNotice | target, allowed pack, permission | confirm/deny | L05 |

## UI quality gates
Check desktop and mobile; color contrast; semantic headings; keyboard actions; real event data; adequate whitespace; no copied chest icon/art; no misleading 'live' fake test. Screen proof must show model/tool/oracle distinctions as separate visual categories.
