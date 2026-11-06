# U06–U10 — Scanning, Live Agent, Findings, Remediation, GitHub

## U06: scan types and creation
| Scan | Event | H/B/L/E | Execution |
|---|---|---|---|
| Recon | Project/source connected | H demo, B generic | Threat model and route map |
| Targeted red-team | Manual | H | BOLA authorization in synthetic invoice target |
| Deep security assessment | Manual/schedule | B | Source+safe runtime pack |
| PR review | GitHub webhook | B | Diff review, targeted test when approved preview |
| Fix verification | Change/replay | H | Repeat recorded test + positive controls |
| Prelaunch pack | Requested | L | Supported checks with explicit coverage |
| Scheduled | Cron/policy | B | Revalidate policy, run |
| Incident / AI agent | Investigation | E | Advanced tested scope |

**Create:** project overview → New assessment → type → source version/target → test pack → identity/limits → scope review → POST with Idempotency-Key → scan job → live. User can cancel. Duplicate same request shows existing job rather than launching extra cost. Each scan links to immutable config and revisions; no arbitrary mid-run expansion.

**Scan lifecycle:** draft → preflight → awaiting_approval or queued → preparing → recon → planning → executing → verifying → finalizing → completed / partial / failed / canceled. Terminal states leave evidence. Failed runner does not create confirmed finding.

## U07: live agent UX
**Header:** project, scan ID, status, elapsed time, source revision, authorized environment, Cancel.
**Timeline:** indexed events, phase, agent rationale, tool name, execution state, policy verdict, evidence ID, timestamp. Event detail drawer differentiates proposed vs run vs verified.
**Tabs:** Activity (default), Investigation, Evidence, Sandbox, Findings, Logs (advanced). Each has genuine loading, empty, disconnected, canceled and failed states.
**Streaming:** SSE with persisted event ID and reconnect, or short polling fallback. Browser disconnect does not cancel server work.
**Approval (B):** pending step pauses, authorized actor chooses allow once/deny; approval includes exact action, scope, expiry and immutable hash. No model self-approval.
**Cancellation:** user confirms → API marks cancel_requested → stops pending scheduling → executor terminated → artifacts preserved → UI shows cleanup completion.
**Completion:** View results with coverage; zero findings does not mean secure.

## U08: findings
Finding list fields: severity (independent), confidence, status, project, source/file, affected endpoint, first/last seen, proof icon, assignee (B). Tabs Open/Fixed/Dismissed and severity filters. Stable finding IDs across scans.

**Detail tabs**
1. Overview: understandable outcome + business impact + prerequisites.
2. Attack Path: entry point → trust boundary → code/response/data.
3. Proof: attempt ID, redacted request/response, oracle result, screenshot if relevant, target revision.
4. Replay: button + prior outcomes; requires current approval.
5. Fix: security invariant, code suggestion, copyable agent prompt, regression test.
6. History: chronological occurrences/transitions (B).
7. Discussion: assignment/comments (B).
8. Related: linked or correlated issues (L).

**Three axes, never merged:** severity = impact; confidence = how observed; remediation = action state. Example: High / Confirmed by execution / In progress. If no execution, show Suspected or Supported by analysis.

**Triage:** assign, accept risk with reason/review date, dismiss false positive with note, reopen, export, link issue; server RBAC/audit. Actions like Dismiss never erase underlying evidence.

## U09: remediation parent
~~~mermaid
flowchart TD
 A[Finding] --> B{Fix method}
 B --> C[Copy agent prompt]
 B --> D[Manual patch]
 B --> E[Proposed PR - later]
 C --> F[Code revision]
 D --> F
 E --> F
 F --> G[Build/deploy authorized test revision]
 G --> H[Replay original bounded attempt]
 H --> I{Unauthorized outcome blocked?}
 I -->|No| J[Fix failed: remains open]
 I -->|Unclear| K[Inconclusive]
 I -->|Yes| L[Run legitimate positive control]
 L --> M{Normal behavior works?}
 M -->|No| N[Regression introduced]
 M -->|Yes| O[Verified fixed]
 J --> B
 K --> B
 N --> B
 O --> P[History, dashboard, notification]
~~~

**Fix prompt content:** vulnerability summary, relevant file lines if known, exact preconditions, security invariant, failing regression test, smallest suggested change, expected authorized behavior, instructions for retesting, request for summary.

**Replay requirements:** a new replay record references original finding/attempt, same test pack version, target and source updated version, identities/fixtures, scope and authorizer, executed oracle outcomes. Attack no longer reproduces AND baseline passes → verified fixed. Missing evidence → inconclusive. 'Mark resolved' cannot set verified status without test.

**Demo:** vulnerable revision yields Bob invoice to Alice; patched revision returns 403 or equivalent while Alice→Alice yields 200. Show before/after artifacts side by side without replaying a prerecorded mock as if live.

## U10 GitHub / CI/CD (B)
~~~mermaid
flowchart TD
 A[PR opened / synchronized] --> B[Signed webhook]
 B --> C[Verify delivery + repo installation]
 C --> D[Idempotency repo PR head SHA]
 D --> E[Fetch diff + immutable code ref]
 E --> F[Risk-focused analysis]
 F --> G{Authorized preview target ready?}
 G -->|No| H[Analysis only]
 G -->|Yes| I[Scoped security test]
 I --> J[Independent verification]
 H --> K[Publish GitHub Check]
 J --> K
 K --> L{Policy threshold reached?}
 L -->|Yes| M[Fail Check; human review]
 L -->|No| N[Pass/neutral]
~~~
- GitHub App installation is independent of GitHub OAuth sign-in.
- GitHub Check for stale SHA must not override latest PR head.
- Forked PRs never receive secrets; run static analysis or controlled preview only.
- Check outcomes: fail only for defined blocking evidence; neutral for inconclusive/unavailable; pass for completed selected checks.
- Configurable 'every push / when asked / off' and severity gate in beta.
- Webhook duplicate delivery, reinstall/revoke, permissions, rate limits, draft PRs, deleted branches and preview timeouts have explicit states.

## Cross-flow navigation
New assessment → Live → Scan overview → Finding detail → Fix → Replay → Finding updated → Overview. Clicking evidence never escapes project access policy. Notifications deep-link to finding/scan after sign-in. GitHub Checks link to applicable scan and commit, never generic project home.

## Error matrix
| Failure | Frontend | Backend |
|---|---|---|
| Target unreachable | Preflight block | no test dispatched |
| Invalid model plan | 'Replanning' or failed | validator rejects, bounded retry |
| Worker timeout | Inconclusive/partial | kill + cleanup + audit |
| Scope violation | Containment event | stop/deny before network |
| Version mismatch | 'Re-run required' | prevent false fix verdict |
| Evidence unavailable | Warning | do not mark confirmed |
| Replayed fix fails | Still open | preserve both attempts |
| User cancels | Canceled + clean-up indicator | stop pending/executing work |
