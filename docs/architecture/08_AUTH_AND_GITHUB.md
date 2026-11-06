# Authentication, Workspace Permissions and GitHub Integration

## Identity choices
Use **Better Auth** on Next.js and Drizzle/PostgreSQL. Generate auth schema using installed version; do not invent session tables or trust middleware-only redirects as authorization. OAuth callback must validate state, callback URL and session. Server endpoints call session API and enforce workspace membership. Selected architecture has one auth source of truth (not simultaneously Supabase Auth/Clerk).

## Auth vs connection vs target authorization
- Authentication: Who is logged in?
- Workspace authorization: May this person access the project/evidence or start approved scan?
- Source authorization: Does the GitHub App installation permit selected repo contents?
- Target authorization: May HighCastle run specific actions against a specific test environment?
These are four different checks. An owner role or GitHub login never substitutes for permission to attack a target.

## Session security
Use secure HTTP-only same-site cookies over HTTPS, CSRF defense on mutations, short sensible session lifetime/rotation, controlled OAuth redirect allowlist, rate limits, audit on privilege changes, no tokens in URLs. Sign out invalidates session; loss of team membership must revoke relevant project access even with active session. Server rechecks access to artifact and event stream on subscription.

## Workspace role matrix
Roles owner/admin/developer/viewer:
- Owner all permitted workspace administrative actions, can manage scope and approvals.
- Admin manage projects, scope/policy within delegated rules, limited billing.
- Developer run already-approved checks, triage findings, see technical evidence by policy.
- Viewer summary/read-only and limited evidence.
- Operator role is internal, scoped and audited break-glass, never implicitly full cross-customer access.
Target permission separately checked with signed-off scope regardless of role.

## GitHub App model (Beta, not H)
**Installation flow**
1. User authenticates and selects Connect GitHub under project source.
2. Check installation, if absent redirect to GitHub App with selected repository access.
3. Verify callback and installation/account association; store installation ID, never persist user PAT unnecessarily.
4. Fetch only explicitly permitted repo identifiers and branch metadata.
5. Select repo and commit SHA; create project_source.
6. Run source recon only; ask for independent target authorization if active execution requested.
7. Installation revoked/suspended/changed → mark source disconnected and stop dependent jobs.

**Webhook security**
- Verify HMAC signature against raw body, request timestamp/event and delivery ID.
- Dedup by delivery ID plus repo/PR/head SHA; never process unsigned payload.
- Only permit events for installed repositories and relevant branches.
- Forked PR code untrusted; do not provide deployment tokens, app secrets, GitHub installation credential or privileged CI runner.
- PR Checks produce pass/fail/neutral based on verified evidence and configured gate, do not fail simply on unverified hypothesis without explicit rule.
- Stale PR results tied to SHA; never attach a previous commit's passing check to newest head.

## Developer lifecycle (B)
Every PR push/when asked/off defaults configured at organization then repo; choose a policy severity threshold (Critical/High/Medium/Any) and evidence confidence for blocking. Run fast source analysis for each PR, targeted execution only when safe preview target already authorized. Post GitHub Check with link to exact scan/finding and commit. Fix pushed → new check; preserve history.

## H authentication minimum
If full GitHub OAuth isn't ready, public sample demo does not require authentication and is strictly limited to shared/isolated synthetic state. Protected workspace/internal features must still guard access and may be behind a simple verified session during H. Don't ship a fake auth token bypass into protected controller routes.

## Required tests
- No session → protected project API 401.
- Member of workspace A cannot access workspace B project IDs or artifacts (404/403).
- Viewer cannot mutate scan or approval.
- GitHub OAuth login cannot read repos without installed App.
- GitHub webhook with invalid signature rejected.
- Session revocation invalidates SSE/evidence access.
- Existing link to removed project does not leak sensitive metadata.
- Target authorization failure blocks actual runner even for owner.
