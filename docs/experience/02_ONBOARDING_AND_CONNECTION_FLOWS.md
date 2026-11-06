# U01–U05 — Discovery, Identity, Onboarding, Connection and Authorization

## U01 public site
**Inputs:** incoming traffic, referral/deep link, intent. **Surfaces:** landing, live/synthetic demo, product explanation, docs and (later) pricing. **State:** optional `returnTo` preserved via signed/validated relative URL to prevent open redirects.

Landing sequence: hero 'Your personal AI hacker' → three observable steps 'Inspect / Prove / Replay' → proof animation clearly marked sample or live → why isolation matters → Builder/Developer segmentation → focused CTA. Security claims are bounded, no '100% secure'. A visitor can navigate demo without giving real repository access. Exiting demo → get started → signup → continue creation. Public demo cannot submit an arbitrary hostname for active tests.

## U02 authentication cases
| Case | Steps | Validations | Recovery |
|---|---|---|---|
| GitHub login | initiate OAuth → provider consent → callback with state → establish session | state/PKCE where supported, allowed callback, signed cookie | restart after cancellation |
| Email flow (B) | register → verification → session | unique normalized email, rate limit, confirmation | resend safely |
| Existing session | request → cookie/session validation on server | expiry, revocation | sign-in redirect |
| Expired deep link | target route → auth → returnTo validated | workspace access checked anew | 403 if revoked |
| Invite (B) | authenticate → inspect invitation → accept/decline | token expiry, workspace role, exact recipient | reissue |
| Account linking (B) | verify current identity → OAuth/email link | prevents account takeover | recover |

Never conflate GitHub login with repository content permission. GitHub App is an independent installation.

## U03 first-run wizard
**Step 01 — Welcome:** introduction and sample app offer, no fake scan history.
**Step 02 — Experience:** Builder vs Developer. Saving mode is UI preference.
**Step 03 — Goal:** prelaunch, security review, PR check (B), 'explore demo'. Use response to tailor defaults only.
**Step 04 — Workspace:** name/slug/solo-team; owner membership. If already invited, skip creation.
**Step 05 — Project:** name, description, tech stack selection if known; draft state.
**Step 06 — Connection:** GitHub source, verified target, or owned test lab. H only test lab.
**Step 07 — Environment:** synthetic credentials; source/target availability disclosure.
**Step 08 — Authorization:** scope, limits, exact permitted destination and test categories.
**Step 09 — Preflight:** reachability, health, identity and sandbox. Failure returns to relevant previous step.
**Step 10 — First scan:** submit idempotent request, navigate /live.
**Step 11 — Completion:** actual result and optional tour; resume at dashboard.

Persist each step, not one transient browser object. Navigation back must preserve state. If user closes tab mid-setup, project shows 'Setup incomplete' and Continue setup. No mandatory modal blocking a veteran user with existing accessible workspace.

## U04.A GitHub source connection (B)
~~~mermaid
flowchart TD
 A[Connect repository] --> B{GitHub App installed?}
 B -->|No| C[Install app with selected repos]
 B -->|Yes| D[Choose allowed repository]
 C --> D
 D --> E[Verify installation + permission]
 E --> F[Choose branch/commit]
 F --> G[Create source snapshot]
 G --> H[Recon source]
 H --> I{Authorized live target?}
 I -->|No| J[Analysis-only; configure staging]
 I -->|Yes| K[U05 preflight]
~~~
- Install only requested repository selection; present permissions before redirect.
- Callback must verify state/installation IDs and account relation. Never assume OAuth alone grants repo read.
- Snapshot commit SHA rather than mutable default branch string.
- Unsupported stacks show 'source analysis only'; no pretense of deployment.
- Errors: no repos, installation suspended, transfer, renamed repo, revoked installation, unreachable GitHub, deleted source. Project survives with explicit disconnected state.

## U04.B URL connection (L)
- Normalize URL and require HTTPS by default; reject invalid host/userinfo/IP literals/internal addresses unless explicit enterprise-controlled target setup.
- Domain verification challenge is only proof of control; collect separate authority to test app, included third-party dependencies, and permitted test intensity.
- DNS rebinding and redirects can bypass superficial hostname checks; re-resolve/check destination at every connection and enforce sandbox egress.
- Authenticate via synthetic accounts; no customer session token pasted into LLM.
- URL-only behavior cannot infer internal code provenance, and report states 'black-box coverage only'.
- Preflight and authorization always before active request.

## U04.C hackathon sample
- Select prebuilt invoice-lab. Create project with scope hardcoded by server to lab network/host, a short expiry and synthetic Alice/Bob.
- Demo user cannot edit the permitted target to arbitrary URL.
- Vulnerable and patched snapshots are versioned; replay cannot mislabel the versions.
- Show project readiness state, synthetic fixture labels, demo guardrail banner and Start assessment.

## U05 testing setup detailed
| Step | Input | Server validation | Stored result |
|---|---|---|---|
| Verify | target/domain ownership | proof and expiry | target_verifications |
| Environment | isolated lab/staging | approved project + network policy | environments |
| Scope | hosts, paths, methods, exclusions | allowlist, private IP controls | scope immutable version |
| Identity | test account references/roles | scoped vault handles, synthetic | test_identities |
| Data | fixtures/version | no real PII | fixture manifest |
| Intensity | passive/low-impact/state-changing | policy-allowed pack list | test_permissions |
| Budget | max time/requests/CPU/memory | caps below operator maximum | execution_limits |
| Approvals | required actor/test class | role and explicit consent | approvals |
| Preflight | DNS, target health, app version | reachability, bounded redirects | preflight result |
| Confirm | scope exact snapshot | signed-in actor and expiry | authorization record |

**Policy rule:** If the user's authorization changes after a scan is queued, revalidate immediately before execution and at each tool request; revoke/stop if necessary.

## User-facing copy examples
- 'We can inspect source code now. To safely reproduce an issue, connect a disposable or staging test application.'
- 'You control what HighCastle may test. This URL alone does not authorize third-party systems.'
- 'This demo uses synthetic invoices and accounts. No real customer records are involved.'
- 'The source snapshot changed. Run a new assessment for the updated revision.'
- 'No confirmed issue in tested scenarios; other weaknesses may remain.'

## UI/UX requirements
Wizard stepper with save/resume, accessible error summary, keyboard focus on first invalid field, never silently drop credentials or user selections, explicit CTA for each step, no deceptive loaded/verified states. See `06_SCREEN_SPECS.md` and `07_MODALS_AND_OVERLAYS.md`.
