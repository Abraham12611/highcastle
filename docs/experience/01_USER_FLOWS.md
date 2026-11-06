# Complete User Flows — HighCastle

## Flow notation
- U01–U19 = parent user/product journey. Sub-flow uses Uxx.y.
- H/B/L/E denote hackathon/private beta/public launch/expansion. Only H is a current implementation requirement.
- Every mutation enforces workspace membership and server-side policy. Modes alter copy/detail, NOT authorization.
- Every 'user starts scan' action is an API call creating a durable scan; no long-lived browser request is the execution engine.

## The master product journey
~~~mermaid
flowchart TD
 A[Landing] --> B[Demo, features, pricing]
 B --> C[Sign up or sign in]
 C --> D[Create or join workspace]
 D --> E[Builder or Developer mode]
 E --> F[Create project]
 F --> G{Connect what?}
 G --> H[GitHub source]
 G --> I[Verified app URL]
 G --> J[Demo lab]
 H --> K[Authorized environment config]
 I --> K
 J --> K
 K --> L[Scope and preflight]
 L --> M[Launch scan]
 M --> N[Live agent work]
 N --> O[Results]
 O --> P[Finding]
 P --> Q[Fix guidance]
 Q --> R[Apply patch]
 R --> S[Replay]
 S --> T{No reproduction and positive control passes?}
 T -->|Yes| U[Verified fixed]
 T -->|No/inconclusive| Q
 U --> V[Monitor and PR checks]
 V --> M
~~~

## Full parent registry
| ID | Parent | Actor | Stage | Depends on | Outputs |
|---|---|---|---|---|---|
| U01 | Discovery / public website | Visitor | H/L | None | Demo/signup intent |
| U02 | Authentication / access recovery | Visitor, member | H/B | Identity provider | Session |
| U03 | Workspace / first-run onboarding | User | H/B | U02 | Workspace/project draft |
| U04 | Project creation / connections | Owner, dev | H/B/L | U03 | Source/target/demo |
| U05 | Verification and scope / preflight | Authorized owner | H/B/L | U04 | Signed-off scope |
| U06 | Manual scan creation | Project member | H | U05 | Scan job |
| U07 | Live agent investigation | Member | H | U06 | Events + evidence |
| U08 | Findings / triage | Member | H | U07 | Triage changes |
| U09 | Remediation / verification | Builder, dev | H/B | U08 | Patch/replay verdict |
| U10 | GitHub/CI automation | Developer | B | U04/U05 | PR checks |
| U11 | Scheduling / monitoring | Owner/dev | B/L | U05 | Periodic scans |
| U12 | Reporting / sharing | Founder/agency | B/L | U08 | Reports |
| U13 | Alerts / notifications | All | B | Events | Deep links |
| U14 | Team / organization | Owner/admin | B/L | U03 | Membership and roles |
| U15 | Billing / usage | Billing admin | L | Workspace | Entitlements |
| U16 | API/MCP/integrations | Dev | B/L | Workspace | Connections |
| U17 | Account/project security | Owner/admin | B/L | Workspace | Policies + audits |
| U18 | Self-host / enterprise | Enterprise admin | E | Dedicated infra | Controlled private execution |
| U19 | Internal platform operations | HighCastle operator | H/B | All | Monitoring and incident handling |

## U01 Discovery / public website (H landing/demo; L rest)
- U01.1 New visitor: marketing page → hero proof proposition → watch interactive demonstration or learn product → get started → preserve return destination.
- U01.2 Public demo: own synthetic demo account, replayed sample history explicitly labelled sample; optional truly executed controlled scan; sensitive actions route to signup.
- U01.3 Pricing intent: plan selection → auth → intended-plan context (future).
- U01.4 Docs intent: scan/findings/fix/sandbox constraints → next-step links.
- U01.5 Return visitor: sign in restores last accessible workspace.
Alternate: no JS/slow page -> accessible static content and working auth link.

## U02 Authentication (H basic, B recovery)
- U02.1 Sign up GitHub OAuth: redirect state+PKCE provider → session.
- U02.2 Email signup/verification (B).
- U02.3 Sign in / existing session restore.
- U02.4 Recover access, expired session, reauthenticate, redirect to original permitted target (B).
- U02.5 Link another login method with verified identity (B).
- U02.6 Sign out/revoke session.
- U02.7 Accept/decline workspace invite after authentication (B).
**Important:** GitHub login ≠ installation of GitHub App repository permissions. No implicit access.

## U03 Onboarding (H small path)
- U03.1 Welcome and mode choice; simple copy vs technical copy.
- U03.2 Goal choice: prelaunch, investigate, PR protection, sample.
- U03.3 Create or join workspace; slug uniqueness and role owner.
- U03.4 Create project draft; validation/ownership.
- U03.5 Connection path to U04.
- U03.6 Scope + preflight to U05.
- U03.7 Start first scan to U06.
- U03.8 Complete guide, show actual result vs empty state.
- U03.9 Save/leave/resume; users with existing project skip.
- U03.10 Invitation skip new project if workspace already has accessible projects.
Empty: no sources/targets must say 'Not configured', not fake score.

## U04 Project creation and connection (H demo; B GitHub; L URL)
- U04.A GitHub source: install App with selected repo access → verify installation → select repo/branch → snapshot SHA → initial recon → optional target authorization. Handle revoked/renamed/deleted/no permission.
- U04.B URL target: enter valid URL → prove domain/control using TXT or well-known file → independently authorize permitted scan → choose staging and synthetic identities → preflight. SSRF protection mandatory.
- U04.C Demo: choose owned synthetic invoice lab → provision or identify controlled target → assign Alice/Bob → locked scope → run.
- U04.D Incomplete setup: persist draft and resume by step.
- U04.E Source only: allow static analysis, label no active test coverage.
- U04.F Target only: permitted behavioral test, label no source mapping.
- U04.G Multiple repos/environments (B/L), no mistaken implication one repo = one live host.

## U05 Authorization and preflight (H locked policy; B customizable)
- U05.1 Verify ownership/control; U05.2 environment staging/Attack Twin; U05.3 host/path/method exclusions; U05.4 synthetic test identities; U05.5 test data; U05.6 intensity; U05.7 time/request/concurrency budget; U05.8 approvals; U05.9 preflight (DNS, destination, health, credentials, sandbox); U05.10 affirmative scope confirmation; U05.11 expire/revoke authorization; U05.12 exact snapshot attached to scan.
- Failed permission -> block, explain, never silently widen plan.
~~~mermaid
flowchart TD
 A[Assessment request] --> B{Scope valid?}
 B -->|No| C[Stop/verify]
 B -->|Yes| D{Target and environment allowed?}
 D -->|No| E[Stop/choose staging]
 D -->|Yes| F{Synthetic credentials ready?}
 F -->|No| G[Set identities]
 F -->|Yes| H{Sandbox preflight healthy?}
 H -->|No| I[Block/diagnose]
 H -->|Yes| J[Approve scope snapshot]
 J --> K[Queue]
~~~

## U06 Manual scan (H)
- U06.1 New assessment wizard: type → source revision/target → test pack → identities → resource limits → summary → launch.
- U06.2 Targeted assessment: H BOLA only; later auth, API, configuration, inputs, supply-chain, business logic, AI-agent permissions.
- U06.3 Duplicate-scan detection/idempotency: existing job view vs new request.
- U06.4 Queue/cancel/retry. Retry creates linked run and carries immutable scope.
- U06.5 Scope edits require new authorization; not mid-run silent changes.
- U06.6 Partial completion preserves completed evidence.

## U07 Live investigation (H)
- U07.1 Subscribe SSE + replay persisted events since last event ID.
- U07.2 Expand action: plan vs executed result vs independent verdict.
- U07.3 Approval pause (B), denied paths logged.
- U07.4 Cancel → scheduler cancellation + worker kill, not UI-only.
- U07.5 Reconnect browser → rehydrate scan history.
- U07.6 Completion → results; error/partial states accurately marked.
Tabs: Activity, Investigation, Evidence, Sandbox, Findings; developer logs (sanitized).

## U08 Findings (H)
- U08.1 Filter by severity, evidence confidence, remediation, source, project, dates.
- U08.2 Detail tabs: Overview, Attack path, Proof, Replay, Fix, History, Discussion, Related.
- U08.3 Distinct axes: severity critical/high/medium/low/info; confidence suspected/supported/confirmed/not_reproduced/inconclusive; remediation open/in_progress/pending_verification/verified_fixed/accepted_risk/dismissed/reopened.
- U08.4 Triage: assign, risk accept with reason, dismiss false positive, reopen, export, link issue.
- U08.5 Dedup multiple occurrences into one persistent finding (B).
- U08.6 'No findings' does not imply app secure.

## U09 Remediation and fix verification (H)
- U09.1 Generate root-cause + security invariant + regression prompt.
- U09.2 Copy to coding agent, manual patch or eventual suggested PR.
- U09.3 Deploy patched *authorized isolated* app.
- U09.4 Replay exact original attempt and positive baseline.
- U09.5 If unauthorized access still works: remains open; if normal flow broken: regression introduced; if oracle uncertain: inconclusive.
- U09.6 Only verified fixed after both security negative check and positive functionality check.
- U09.7 Link PR/reopen on regression (B).

## U10 GitHub/CI (B, explicitly not weekend)
- U10.1 Install GitHub App/selected repos. U10.2 signed PR event. U10.3 dedupe by installation/repo/PR/head SHA. U10.4 source change analysis. U10.5 run targeted tests only against approved preview. U10.6 GitHub Check pass/fail/neutral. U10.7 new push supersedes stale head. U10.8 branch gate configured by owner. U10.9 handle fork secrets, revoked app, stale deployments, retries, draft PR.

## U11 Monitoring (B/L)
Configure recurrence, project, timezone, resource cap, excluded windows → schedule creates scan → compare previous verified findings → notify; permissions and authorization revalidated each run. Paused projects schedule nothing.

## U12 Reports (B/L)
Generate from stored evidence and limitations; executive plain language, technical trace, evidence ZIP; reports access-controlled, optional expiring share, redacted exports; links return to original scans.

## U13 Notifications (B)
Scan completed, verified high issue, approval needed, fix verified, queue/connection failures → in-app/email with safe summaries and deep links; reauthentication preserves destination; no raw exploit/secret in email.

## U14 Teams (B/L)
Invite → accept role; permission-driven access; switch workspace; transfer project; remove member; revoke sessions/tokens where needed; own workspace remains accessible to other members.

## U15 Billing and usage (L)
Plan/quota → estimate and reserve credits before scan → tally actual usage → reversal per failed-job policy → invoice/payment method; never bill for fake attempts; transparently cap resources.

## U16 Integrations (B/L)
GitHub, coding-agent handoff, outbound webhooks, API/MCP, deploy previews. All permissions explicit; webhook signatures verified; token scoped and revocable; no credential material exposed to sandbox.

## U17 Security settings (B/L)
MFA/sessions, retention, approved domains, policy inheritance, API tokens, evidence access, audits, emergency stop. Policy updates affect future jobs and can cancel current ones if revoked.

## U18 Self-host/enterprise (E)
Dedicated workers/private deployments/SSO/SCIM/data residency with approved internal target network; preserves same API/contracts and documented support boundaries.

## U19 Internal ops (H core telemetry, B UI)
Operator views health/jobs/sandbox orphans/inference errors/containment alerts, can emergency-stop and rotate secrets. No customer exploit payload browsing by default; actions audited.

## Cross-cutting edge conditions
- Never translate model output into 'confirmed' without oracle and artifacts.
- If source/target versions change during scan, mark mismatch and stop/restart.
- If API/inference fails, bounded retry; never fill gaps with fake results.
- Target request may redirect off-allowlist: deny before follow.
- Missing test identities -> preflight issue, not negative security verdict.
- Browser disconnect does not cancel background job; explicit cancel does.
- Scan with zero findings may be 'complete with no reproduced issues in tested coverage', not 'safe'.
- Concurrent scans/quota and exact idempotency managed at server boundary.
