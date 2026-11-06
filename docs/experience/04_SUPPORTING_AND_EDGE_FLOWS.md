# U11–U19 Supporting Flows, Platform Recovery, Permissions

## U11 Monitoring and recurrence (B/L)
1. Project Automation → choose scan type/schedule/timezone, cost limit and allowed environment.
2. Show next run and inherited workspace scope.
3. Save schedule (audit change).
4. Scheduler emits schedule.due, revalidates authorization and quota immediately.
5. Creates idempotent scan job, updates history and notifies on noteworthy outcomes.
6. Owners can pause/resume or set maintenance windows; expired scope disables schedule rather than running permissively.
**Edge cases:** disabled project, deleted source, suspended integration, daylight saving, overlapping runs, scan stuck, insufficient credits, failed alert.

## U12 Reports, exports, sharing (B/L)
Project → Reports → choose technical/managerial template, scan range, include sanitized evidence → generate async report from immutable results → preview → download/share according to RBAC. All external links use expiring scopes; raw authorization cookies never included. Reports include tested coverage, unavailable checks, app revision and confidence classification. Never imply certification/comprehensive pentest. Error: unavailable evidence -> report warning or block, never reconstruct a fake artifact.

## U13 Notifications (B)
Scan complete, confirmed severity threshold, approval required, fix verified, failure, integration revoked, quota near limit. In-app inbox and opted-in email; global bell badge; preferences at account vs workspace level. Deep link to exact project/scan/finding; if logged out, validate safe returnTo; if access revoked, show 403 without sensitive preview. Deduplicate alerts and rate-limit noisy scans.

## U14 Team and roles (B/L)
Invite owner/admin → choose role → email/invite token → acceptance after auth → member list. Roles: owner, admin, developer, viewer. Auth protects API, DB row queries and evidence retrieval. Permission matrix:
| Action | Owner | Admin | Developer | Viewer |
|---|---|---|---|---|
| View permitted results | Yes | Yes | Yes | Yes |
| Start approved scan | Yes | Yes | Yes | No |
| Manage scope/policy | Yes | Yes | No | No |
| Approve elevated test | Yes | Conditional | No | No |
| Access raw sensitive evidence | Yes | Yes | Conditional | Conditional |
| Manage integration | Yes | Yes | Limited | No |
| Remediate/triage | Yes | Yes | Yes | No |
| Invite/manage team | Yes | Yes | No | No |
| Billing & deletion | Yes | Configurable | No | No |
**Important:** Workspace permission never grants permission to test third-party infrastructure. Revoke roles/tokens on removal.

## U15 Billing and usage (L)
Project estimate → credit reserve → scan consumes real usage → final charge/reconcile → history. Unsuccessful infrastructure runs need documented credit policy. Manage plan/payment/invoices top-up. Do not build in hackathon; only store transparent resource metrics.

## U16 Integrations and developer access (B/L)
GitHub App, outbound webhooks, API keys, MCP, coding agents, preview hosts and notification integrations. Every token has scope, expiry, revocation and audit history. Inbound webhooks signed, idempotent and replay protected. Outbound webhook includes event ID, minimized data, retry and signed delivery. No key shared with test runner.

## U17 Security settings / privacy (B/L)
Account sessions, MFA, authorized domains, test scope templates, retention, evidence access, organization audit, emergency stop. Policy versioning: new policy applies to subsequent actions; emergency revocation stops ongoing work. Export/delete user data while preserving legally/operationally required audit minimal records within an explicit policy.

## U18 Enterprise/self-hosted (E)
Customer-controlled workers and sources; SSO, SCIM, retention, redacted export and dedicated network. Supported topology must make source code and evidence residency explicit, isolate credentials from test runners, and preserve centralized policy checks. No hackathon scope.

## U19 HighCastle operations (H telemetry; B management UI)
Operator checks worker health, queue depth, sandbox orphan count, inference cost/errors, containment violations, audit logs, incident queue; emergency stop action terminates workers. Do not expose other workspaces through internal routes. Role guarded, auditable operations, break-glass procedures.

## Recovery matrix
| Failure | Detection | User experience | Operator action |
|---|---|---|---|
| Vultr model timeout | request deadline/error | Scan temporarily delayed then partial/failed | check quota/model |
| Invalid structured AI output | Zod/policy rejection | Replanning or stopped | inspect sanitized trace |
| Worker lost | heartbeat/lease expiry | Retrying/failed | cleanup orphan |
| Sandbox cannot start | controller error | Preflight or job failed | check Docker availability |
| Runner tries forbidden host | firewall+proxy rejection | Containment event | audit & stop |
| Target changes during run | revision fingerprint | Scan partial/version mismatch | re-run on pinned snapshot |
| Test account expires | login health check | Needs setup | replace synthetic identity |
| Captured response ambiguous | oracle | Inconclusive | refine test pack |
| API client disconnects | SSE reconnect | Resumes stream | none |
| DB temporarily unavailable | health / queue failure | Retry banner | restore persistence |
| Evidence object missing | artifact lookup | 'Unavailable' warning | inspect retention/integrity |
| GitHub install revoked | signed revocation event | Source disconnected | stop future checks |
| Emergency stop | operator event | Testing paused | kill/revoke |

## Product error-state vocabulary
- **Not configured:** prerequisites never completed.
- **Not tested:** coverage not attempted.
- **Queued:** work accepted, not running.
- **Inconclusive:** test ran or partly ran, outcome unsupported.
- **Failed:** infrastructure/process failed.
- **Blocked by policy:** intended operation was rejected before execution or at runtime.
- **Confirmed by execution:** independently verified observable result.
- **Verified fixed:** original check no longer reproduces AND positive baseline passes against patched revision.

## Global accessibility and context recovery
Deep links preserve workspace/project; server checks access every request. If user changes mode, route path and evidence IDs are stable. Critical destructive actions confirm explicitly. Avoid fake loaded dashboards when no projects. Keyboard and screen-reader access for every state, with status messages announced appropriately.
