# Navigation, States, RBAC, Route-to-Route Contracts

## Navigation layers
Public header: Logo/Home, Product, Solutions, How it works, Demo, Docs, Pricing, Sign in, Get started. Only publish routes that have content; avoid broken placeholders in hackathon.
Authenticated sidebar: Workspace switcher, Overview, Projects, Scans, Findings, Fixes & Replays, Reports, Automation, Integrations, Settings; Header: notifications, mode and user preferences. Project context: Overview, Scans, Findings, Fixes, Attack surface, Settings. Builder aliases change labels only.

## Route transitions (canonical)
| Source | Trigger | Target/side-effect |
|---|---|---|
| Landing | Get started | /auth/sign-up → onboarding |
| Landing | Try demo | /demo |
| Demo | Inspect finding | /demo/finding |
| Demo finding | Try own app | Auth → project wizard |
| Onboarding | Select demo | Synthetic project + locked target |
| Onboarding | Finish preflight | Assessment wizard |
| Workspace overview | Select project | Project overview |
| Workspace overview | Select finding | Finding detail |
| Project overview | Start assessment | /scans/new |
| Project overview | Configure target | /policy/scope |
| Assessment wizard | Confirm | POST scan → /scans/:id/live |
| Live | Click event | /attempts/:id or details drawer |
| Live | Finding preview | Finding detail |
| Live | Complete | Scan overview |
| Scan overview | Finding | Finding overview |
| Scan overview | Run again | Prepopulated /scans/new |
| Finding | View proof | /proof |
| Finding | Fix issue | /fix |
| Fix | Copy prompt | Clipboard; no route |
| Fix | Retest | M42 → replay job |
| Replay | View comparison | /replays/:id |
| Replay success | View finding | Updated finding overview |
| Replay failure | Improve fix | /fix |
| Integration | Configure checks | Automation/pr-reviews |
| Notification | Open item | Authorized deep-link to exact entity |
| Report | Evidence | Authorized artifact view |

## Page access matrix
| Screen/data | Visitor | Member | Developer | Admin | Owner | Operator |
|---|---|---|---|---|---|---|
| Public landing/demo | Yes | Yes | Yes | Yes | Yes | Yes |
| Workspace overview | No | Read | Read | Read | Read | Scoped only |
| Project/finding read | No | Read if granted | Read | Read | Read | Audited break-glass |
| Raw evidence | No | Restricted | Conditional | Yes | Yes | Audited break-glass |
| Launch approved scan | No | No | Yes | Yes | Yes | Only internal test |
| Change scope | No | No | No | Yes | Yes | Policy-limited |
| Approve elevated test | No | No | No | Conditional | Yes | Policy-limited |
| Team and billing | No | No | No | Conditional | Yes | No |
| Internal jobs / emergency kill | No | No | No | No | No | Yes |
Roles here are normalized examples; first H demo may have simpler owner/member policy. Authentication != authorization != target testing consent.

## Stateful UX contracts
- Loading: visible skeleton, cannot use fake numbers.
- Empty: CTA explains next configuration step.
- Unconfigured target: source scan only, no active run.
- Queued: job accepted, not yet executed; no spinner pretending tests occurred.
- Running: real event ID and agent/tool phase.
- Approval pending: worker pauses with timeout/fail-closed.
- Failed: infrastructure/system failure with retry path.
- Partial: completed evidence preserved, unfinished checks visible.
- Canceled: queue and executor stopped; cleanup status.
- No findings: 'No issues reproduced within tested coverage', never 'secure'.
- Inconclusive: cannot assert vulnerability or fix.
- Scope blocked: policy decision separate from app vulnerability.
- Verified fixed: replay negative and legitimate positive test both pass.

## Deep-link and breadcrumb rules
- Every protected entity URL contains or validates workspace context.
- Guard against object-ID enumeration; authorization should join workspace and project ownership in DB.
- Session loss → /auth/sign-in with validated returnTo *relative* path; after reauth recheck membership.
- Deleting or archiving project → redirect to projects with success explanation; old link shows 410/404 depending policy.
- Switching mode preserves route, current filters and entity IDs. Switching workspaces invalidates cross-workspace filters and permissions.
- Back from finding to scan retains scan filter/search state via query params.
- Invalid IDs show 404 without leaking whether an inaccessible item exists.

## Keyboard and screen-reader interactions
- Top/side nav landmarks, skip-to-content, focus visible.
- Icon-only controls have labels; live scan uses aria-live polite for phase changes, not every log line.
- Modal focus trap and restore, no focus escape behind overlays.
- Severity has text label, not color alone.
- Respect reduced motion; animated pixel sprites not required to understand outcome.
- Long evidence blocks use scroll containment with visible copy labels.
