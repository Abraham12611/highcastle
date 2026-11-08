# L05 auth migration — HMAC demo/account → Clerk account

## What existed before

`lib/auth/session-core.ts` mints two HMAC-signed cookies server-side:

- `hc_session` ("account") — the deferred account path; payload format stable, no real issuer.
- `hc_demo` ("demo") — server-verified guest session for the public synthetic demo (read-only, demo workspace only).

`server/auth/session.ts#getHighCastleSession` is the stable seam L17/L18 consume: verifies cookies, returns `AccountSession | DemoSession | null`.

## What changed (Clerk integration)

- `server/auth/clerk.ts` — server-side verification of the Clerk `__session` JWT (or Bearer token) via `@clerk/backend` `verifyToken` against the configured dev instance.
- `server/auth/session.ts` — resolution order is now: **Clerk token → legacy hc_session → hc_demo**. The interface (`AccountSession|DemoSession|null`) is unchanged; downstream callers need no changes.
- `server/auth/membership.ts` — `internalUserIdForClerk(clerkUserId)`: deterministic UUIDv5-style internal id derived from the stable Clerk subject. Tenant isolation still comes from `authorize.ts` + `workspace_members` — a missing membership row fails CLOSED.
- `app/proxy.ts` — Next 16 middleware (clerkMiddleware): guards `/app/**`; API auth stays inside route handlers (`getHighCastleSession`) so the demo cookie is never treated as account authority.
- `(auth)/sign-in` + `(auth)/sign-up` — Clerk components; sign-in keeps the demo guest entry as a separate, explicitly-labeled path.
- `features/auth/profile-menu.tsx` — UserButton + sign-out for the app shell.
- Onboarding Builder/Developer preference: existing `POST /onboarding/mode` MODE_COOKIE path preserved (preference only, never a security boundary).

## Preserved guarantees

- `hc_demo` grants read-only demo-workspace access ONLY; it can never become an account session, choose targets, or write verdicts.
- Demo guests and real accounts are separate session kinds; the demo path works with or without Clerk configured (proxy is a no-op when env is absent).
- Forged/expired/missing tokens → `null` → fail closed (401/404).
- Dev instance only (`ins_3LnHbu2U2TrGvs…`); before public launch an owner must switch to a Clerk production instance. Secret keys live in `/etc/highcastle/web.env`, never in Git.
