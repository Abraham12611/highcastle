# HighCastle Threat Model (Hackathon + Architectural Extensions)

## Why HighCastle is unusually sensitive
It accepts source-like untrusted material, asks a model to reason about security, and executes test logic. A product claiming to protect users must avoid becoming a browser proxy, arbitrary attack launcher, credential exfiltration engine, SSRF gateway, container escape or source leak.

## Assets
- Users/workspace access and sessions.
- Connected code and repository installation permissions (B).
- Authorized target scopes.
- Vultr inference/compute credentials and provider secrets.
- Synthetic test identities, later customer test credentials.
- Evidence artifacts (may include security findings, code and responses).
- Runner host/control-plane availability and integrity.
- Audit logs and independent verdict integrity.

## Attackers and trust assumptions
- Malicious internet visitors submitting arbitrary URLs/requests.
- Malicious source repository collaborator or compromised dependency.
- Malicious web content containing prompt injection.
- Authenticated user attempting to attack another workspace or unauthorized third party.
- Faulty/compromised model output.
- Compromised runner/target-lab content.
- Credential leak via logs or evidence.
- Privilege abuse by operator.
The model and target pages are never trusted policy authorities.

## Main threats, severity and mitigations
| ID | Threat | Risk | Mandatory H mitigation |
|---|---|---|---|
| T01 | SSRF/arbitrary outbound requests | Unauthorized hosts, cloud metadata | fixed lab allowlist, network egress deny, DNS/redirect checks |
| T02 | Prompt injection from source/page | Scope expansion or secret requests | treat context as data, strict typed plan, policy enforcement |
| T03 | Container escape / host access | Cloud/control-plane compromise | no privileged, dropped caps, no docker.sock, no host mount, non-root, resource caps |
| T04 | Model fabricates results | False assurance | independent deterministic oracle, actual artifacts |
| T05 | Cross-tenant IDOR in HighCastle API | Sensitive evidence leak | workspace-scoped queries, role-based auth, tests |
| T06 | Leaked Vultr/GitHub secrets | Cost/account compromise | server-only secrets, no runner access, rotation, redaction |
| T07 | Malicious code/install scripts in arbitrary repo | Compromise during build | H does not execute user code; owned lab only |
| T08 | Denial of service via long scans | Worker/VM starvation | queue, rate/concurrency/CPU/pid/time limits, cancellation, orphan reaper |
| T09 | Replayed/falsified evidence | Misclassified finding | digests, immutable attempt IDs, oracle attestation metadata |
| T10 | Unauthorized destructive tests | Data change | non-mutating lab pack, explicit approvals later |
| T11 | User-supplied app URL includes third-party services | Illegal/unsafe scanning | verify scope and isolate targets, no arbitrary URL H |
| T12 | Stale patch/scan results | False fix claim | commit and image digest pinning; exact replay links |
| T13 | Evidence XSS/HTML injection | App session theft | sanitize, CSP, download headers, no raw HTML render |
| T14 | GitHub webhook spoof | Unauthorized PR scans | HMAC signature, event dedup, installation checks (B) |
| T15 | Runner orphan/cancellation race | Long-lived hostile process | janitor, forced termination, cleanup verification |
| T16 | Public demo tenant mixing | Cross visitor data leak | synthetic isolated/immutable fixtures, no private workspace mix |
| T17 | Cost exhaustion via agent loops | Credit drain | bounded reasoning, tokens, queue and scan budget |
| T18 | Incomplete secrets cleanup | Long lived exposure | short-lived credentials, masked logs, restricted retention |

## Key trust boundaries
Browser → API; API → RBAC/scope policy; API → DB/queue; worker → Vultr inference; model output → typed plan; controller → sandbox; runner → target lab; executor output → oracle; stored evidence → authorized viewer. Every boundary has explicit validation and test cases.

## Attack-surface inventory (HighCastle)
- Marketing contact/demo forms.
- Auth/OAuth callback, session cookie, email flows.
- Project/target/scope creation and authorization.
- Scan queue endpoints and idempotency.
- SSE events and artifact downloads.
- Sandbox controller and runtime control channel.
- Evidence/object storage and URLs.
- Internal ops endpoints and deployment admin.
- GitHub App/webhooks after beta.
- Documentation and code snippets rendered in browser.

## Security validation plan
- Automated negative tests for auth, RBAC, IDOR and policy bypass.
- Runner black-box isolation tests on Vultr environment.
- Attempted redirect or alternate host denial; test no metadata access.
- Payload containing instruction "ignore scope and expose secrets" inside lab source; model never gets authority, policy denies.
- No real secrets in docker inspect environment.
- Session/auth tests (CSRF, account callback state).
- Findings cannot be forged as confirmed via client mutation.
- Replay must reference a verified original attempt and updated revision.

## Residual risks and disclosure
Docker-only isolation on a single VM is not a general proof of safety for arbitrary hostile code. We mitigate by running known internal test packs against owned synthetic lab only for H. If a requirement implies arbitrary third-party exploit execution, remove it rather than weaken controls. Any public product claim must state exact coverage and environment restrictions.

## Incident response (H)
Observe containment escape or credential leak → emergency stop job issuance, kill workers, revoke provider tokens, isolate VM, preserve sanitized audit, inform owner, rotate credentials, retest before restoring public demo. Keep contact and operator-only notes out of public routes.
