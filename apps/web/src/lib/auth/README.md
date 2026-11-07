# L05 auth & demo session — integration notes

## What exists now (implemented + tested)

Server-verified sessions for the hackathon demo, zero client mocks:

- `POST /api/auth/demo` — mints a **server-signed** demo guest session
  (`hc_demo` cookie, HttpOnly, SameSite=Lax, 1h TTL, HMAC-SHA256, rate-limited
  10/min/IP, same-origin/CSRF enforced). `DELETE` revokes.
- `GET /api/auth/session` — introspection (`401` when unauthenticated).
- `POST /onboarding/mode` — Builder/Developer preference cookie (`hc_mode`,
  non-security). `/onboarding` + `/sign-in` pages wired.

## Stable adapter for L17 (SSE) and L18 (BFF API)

```ts
import {
  getHighCastleSession,        // Headers|Request → AccountSession|DemoSession|null  (null ⇒ 401)
  resolveStreamSession,        // Headers|Request → { userId }|null   (L17 StreamSession shape)
  authorizeWorkspaceAction,    // (session, action, membershipPort?) → boolean
  authorizeScanRead,           // (session, scanId, lookupScan, membershipPort?) → ScanScope|null
  assertSameOrigin,            // Request → Response|null (403 CSRF when rejected)
} from "@/server/auth";  // apps/web/src/server/auth/index.ts
```

- **L17 stream deps**: `resolveStreamSession` satisfies `StreamSession{userId}`;
  `authorizeScanRead` satisfies `StreamAuthorizer` — pass it the scan's
  `{workspaceId, projectId}` lookup. Denied ⇒ `null` (404 semantics).
- **L18**: call `authorizeWorkspaceAction(session, {type, workspaceId}, port)`
  where `port.getWorkspaceRole` wraps `@highcastle/db` `getWorkspaceMember`
  (injected — no DB import here, no circular deps). Without a port it fails closed.
- Guest rules: demo sessions are **read-only inside `DEMO_WORKSPACE_ID`**
  (`a0a0a0a0-…-001`) and bound to `targetAlias:"target-lab"` — guests cannot
  pick hosts, packs, other workspaces, or write verdicts. Verdict writes are
  denied for **every** session kind (client-supplied oracle output rejected by
  construction).

## CSRF model

Cookies are `SameSite=Lax` AND mutating routes require same-origin `Origin`/
`Referer` or `x-highcastle-request: 1` (`assertSameOrigin`). Use it in any new
mutating handler.

## Secrets

- `BETTER_AUTH_SECRET` (already in `.env.example`) signs session cookies.
  Non-production falls back to a fixed dev value; **production fails closed**
  when unset. Never commit real values.

## Deferred (documented, not mocked)

- **Full Better Auth account sessions** — needs L02-owned auth tables
  (`user/session/account/verification`) + coordinator-approved `better-auth`
  dep. The `"account"` session kind, cookie name (`hc_session`), and resolver
  contract are already stable; swapping to real Better Auth is a backend-only
  change in `getHighCastleSession`. `MembershipPort` roles
  owner/admin/developer/viewer are enforced per the role matrix.
- **GitHub OAuth / account registration** — deferred per issue.
- Edge rate-limiting — in-process limiter is best-effort per pod.

## Test coverage (`pnpm --filter @highcastle/web test`)

`session-core.test.ts`, `authorize.test.ts`, `demo-route.test.ts`:
sign/verify roundtrip, tamper/wrong-secret/expiry/kind-confusion rejection,
mint cookie attrs, CSRF 403, rate-limit 429, revoke, unauthenticated 401,
forged cookie 401, guest read-allowed-in-demo-WS-only, guest mutation denied,
cross-workspace deny, role matrix (viewer/developer/admin), verdict never
client-writable, `authorizeScanRead` L17 contract.
