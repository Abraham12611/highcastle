# M01–M60 — Complete Modal, Drawer, Dialog and Overlay Registry

**Rules:** Short bounded confirmations → modal; rich configuration or work → full route; contextual logs/evidence → drawer; filters/profile → popover. All need labelled title, accessible focus behavior, escape/close semantics where safe, error and loading states. Never hide scope approval behind generic terms. No stacked destructive dialogs. Opening a dialog is NOT authorization.

## Global (M01–M10)
| ID | UI | Origin | Submit/outcome | Stage |
|---|---|---|---|---|
| M01 | Sign-in required | Restricted visitor action | Auth then validated return | H |
| M02 | Switch workspace | Header picker | Select accessible workspace | B |
| M03 | Create workspace | Switcher | New owner workspace | B |
| M04 | Change experience mode | Profile | Set personal Builder/Developer preference | H |
| M05 | Unsaved changes | Leaving dirty form | Stay/discard, no silent loss | H |
| M06 | Session expired | API/session expiry | Re-auth then resume permitted route | H |
| M07 | Permission denied | Forbidden action | Explain required role | H |
| M08 | Upgrade required | Entitlement limit | Compare plan | L |
| M09 | Global error | Request failure | Retry/diagnostic ID | H |
| M10 | Notifications | Header bell | Navigate to exact item | B |

## Project & authorization (M11–M22)
| ID | UI | Origin | Submit/outcome | Stage |
|---|---|---|---|---|
| M11 | New project | Project list | Open wizard | H |
| M12 | Select connection | New project | Demo/GitHub/verified URL | H/B/L |
| M13 | Install GitHub App | Source connection | External permission flow | B |
| M14 | Select repositories | GitHub callback | Attach allowed sources | B |
| M15 | Verify domain | URL connection | DNS/file challenge | L |
| M16 | Define target scope | Setup/policy | Immutable scoped authorization version | H/B |
| M17 | Add test identity | Environment | Save synthetic role reference | H/B |
| M18 | Connection failed | Source error | Retry or reconnect | B |
| M19 | Target authorization | Before active test | Explicit actor, host, limits and consent | H |
| M20 | Delete project | Danger zone | Strong confirmation; cancel jobs | L |
| M21 | Archive project | Project settings | Disable future automation | B |
| M22 | Remove source | Source settings | Revoke association/disable source checks | B |

## Scan and execution (M23–M34)
| ID | UI | Origin | Submit/outcome | Stage |
|---|---|---|---|---|
| M23 | New assessment | Project overview | Open full wizard | H |
| M24 | Scan scope review | Before launch | Confirm exact target, test pack, identities and bounds | H |
| M25 | Scan budget | Before paid run | Confirm estimated resource use | B |
| M26 | Unsafe test approval | Orchestrator pause | Approve one scoped action / deny | B |
| M27 | Cancel scan | Live view | Mark cancel_requested, kill runner, show cleanup | H |
| M28 | Retry scan | Failed/partial view | New linked attempt, same scope | H |
| M29 | Queue explanation | Queued scan | Show queue and available actions | H |
| M30 | Sandbox event detail | Containment tab | Reveal actual denial metadata | H |
| M31 | Test attempt detail | Timeline row | Drawer or route with request/result/oracle | H |
| M32 | Evidence preview | Evidence index | Redacted artifact viewer | H |
| M33 | Scan failed | Error state | Failure diagnostics, allowed retry | H |
| M34 | Pause/resume schedule | Automation | Update recurrence | B |

## Findings and remediation (M35–M47)
| ID | UI | Origin | Submit/outcome | Stage |
|---|---|---|---|---|
| M35 | Finding filters | Findings list | Apply filters | H |
| M36 | Assign finding | Finding detail | Select authorized member | B |
| M37 | Accept risk | Triage | Reason, actor, review date, audit | B |
| M38 | Dismiss false positive | Triage | Required reason; retain evidence | B |
| M39 | Reopen finding | History | Restore open status | B |
| M40 | Copy fix prompt | Fix | Copy to clipboard + confirmation | H |
| M41 | Choose coding agent | Fix | Handoff to supported integration | B |
| M42 | Confirm replay | Finding | Revalidate scope and start new run | H |
| M43 | Verification result | Replay finish | Before/after assertions and verdict | H |
| M44 | Create GitHub issue | Finding | Review redacted payload then create | B |
| M45 | Create fix PR | Remediation | Review proposed patch before write | E |
| M46 | Bulk actions | Findings | Explicit selection and server permission | L |
| M47 | Share evidence/report | Finding/report | Expiring access-controlled link | L |

## Team, integration, settings (M48–M60)
| ID | UI | Origin | Submit/outcome | Stage |
|---|---|---|---|---|
| M48 | Invite member | Team | Send scoped role invite | B |
| M49 | Change member role | Members | Confirm privilege adjustment | B |
| M50 | Remove member | Members | Revoke workspace access | B |
| M51 | Disconnect integration | Integrations | Revoke/pause dependent work | B |
| M52 | Create API key | Dev settings | Show secret once | L |
| M53 | Revoke API key | Dev settings | Disable token and dependent clients | L |
| M54 | Schedule assessment | Automation | Save recurrence with scope checks | B |
| M55 | Configure security gate | GitHub settings | Define blocking threshold/evidence policy | B |
| M56 | Change plan | Billing | Confirm plan and cost | L |
| M57 | Add credits | Usage/billing | Payment checkout | L |
| M58 | Delete account/workspace | Danger zone | Re-auth and explicit deletion confirmation | L |
| M59 | Export data | Privacy settings | Queue authorized export | L |
| M60 | Emergency stop | Owner/operator | Terminate active and future tests; audit | H/B |

## H-modal implementation details
- M04: menu with Builder/Developer and definition. Changing mode keeps route and persistent scan state.
- M05: return focus, no background navigation until choice.
- M19/M24: show exact *owned invoice lab*, hostname/network, test class BOLA, expiry, synthetic accounts, request/time limits and 'not production' warning; confirm policy snapshot. Server checks again on dispatch.
- M27: 'Stop scan?' explains evidence collected so far is retained and cleanup occurs; cannot just hide loading screen.
- M30: event ID, denied action, enforced boundary, policy version, time, runner/container reference, no secrets.
- M31: test objective, proposed action, validated arguments (redacted), execution actual, output and independent verdict.
- M32: screenshot/text/code blocks with sanitization and integrity hash.
- M33: error code, retry only if safe; no misleading passed check.
- M40: copy includes root cause, invariant, regression requirements and expected authorized behavior. Never copies secret cookies.
- M42: target must be updated isolated revision; preflight and scope confirmation if changed.
- M43: only 'verified fixed' when negative assertion + positive baseline pass.
- M60: operator emergency control must enforce server-side stop even if open dialog/browser disappears.

## Screen interaction vs modal contract
Main navigation always resolves to a route. Dismiss dialogs do not mutate. Double-submit protected with disabled state/idempotency key. A confirmation with delayed backend completion shows pending until server acknowledges. Authorized destructive action must create audit event. See `08_NAVIGATION_STATES_AND_ACCESS.md`.
