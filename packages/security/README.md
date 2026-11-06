# @highcastle/security

Deterministic authorization and policy engine for HighCastle (lane L04).

This package is the **trusted boundary between AI-generated test proposals
and permitted operations**. It is a pure module: no network, DNS, filesystem,
database, credentials or model calls. Every input is `unknown` and
re-validated through the frozen `@highcastle/contracts` Zod schemas. Every
output is an immutable `PolicyDecision` — `allow` with an execution
envelope, or `deny` with audit-safe machine-readable reasons. **Fail closed
on any evaluation problem.**

## Security model (non-negotiable)

- The model is **never** a policy authority. It names an enumerated pack ID;
  it cannot name hosts, URLs, commands, methods, budgets or permissions —
  `ModelProposalSchema` is `.strict()`, and this engine re-checks the parsed
  plan against the approved scope anyway.
- Policy precedence (security/02): operator hard caps → project/target
  authorization → signed scope snapshot → approval → pack declaration →
  model-requested action. **Intersection only** — a lower layer narrows,
  never widens.
- A scope whose content doesn't match its immutable `scopeHash` is treated
  as tampered: deny before any other check.
- Expired/revoked/not-yet-valid scope → deny. Missing policy → deny.
  Evaluation exception → deny.
- The only executable target in H is the owned synthetic invoice lab via
  the fixed `target-lab` service alias. No URL, hostname or redirect target
  supplied by a model, client or `Location` header can ever reach a runner.

## Public interface

### Policy engine — `policy.ts`

| Export | Purpose |
|---|---|
| `evaluatePlanAuthorization(input)` | Full plan gate for L13. Re-parses scope/project/target/environment/proposal/operatorCaps through contracts, then evaluates: integrity hash → status/expiry → workspace/project/target/environment relations → proposal validity → pack scope → target alias → budget intersection. Returns immutable `PolicyDecision`; `allow` carries `ApprovedExecution` (pack, alias, permitted methods, effective limits, expiry) that L13 hands to L14. |
| `evaluateRequestAuthorization(input)` | Per-action gate for L13/L14/L18: method + path + optional host against the same scope (hash + status re-verified). |
| `scopePolicyHash(scope)` | Recompute the hash for a parsed scope (audit convenience). |

`PlanAuthorizationInput` / `RequestAuthorizationInput` accept `unknown`
fields plus an injectable `now: Date` for deterministic tests.

### Decisions — `decisions.ts`

`PolicyDecisionSchema` (Zod discriminated union), `PolicyDenyCodeSchema`
(30 closed deny codes), `PolicyDenyReasonSchema` (≤280-char safe detail),
`ApprovedExecutionSchema`, `AuthorizedRequestSchema`,
`EffectiveExecutionLimitsSchema`, `POLICY_ENGINE_VERSION` (stamped on every
decision), `allowDecision`/`denyDecision`/`denyReason` builders, `deepFreeze`.

### Scope hashing — `scope-hash.ts`

| Export | Purpose |
|---|---|
| `computeScopeHash(scope)` | SHA-256 over a canonicalized scope: sorted keys, lowercased/sorted/deduped allow-lists, **excludes `status`** (mutable lifecycle) and `scopeHash` itself. Covers ids, timestamps, hosts, paths, packs, methods, all budgets, network profile, `version`. |
| `verifyScopeHash(scope)` | Constant-time recompute-and-compare; fails closed on malformed stored hash. |
| `canonicalizeScope`, `stableStringify` | Exposed for audit/debugging and for L02/L18 to reproduce the hash byte-identically. |

### Scope gate — `scope-gate.ts`

`checkScopeStatus(scope, now)` (revoked/expired/not-yet-valid) and
`checkScopeRelations(scope, {project,target,environment}, now)` —
workspace isolation (all four objects share `workspaceId`), project/target/
environment ID equality with the scope, project lifecycle, target `verified`
state + verification expiry, environment `ready` provision status.

### Budgets — `budgets.ts`

`OperatorExecutionCapsSchema` (deployment ceiling, bounded by both contract
cap sets), `DEFAULT_OPERATOR_CAPS` (= H sandbox hard caps),
`intersectExecutionBudget(scope, caps, packId)` (component-wise min across
operator ∩ scope ∩ pack manifest ∩ `SANDBOX_HARD_CAPS`),
`checkRequestedBudget(requested, effective)` → `budget_exceeded` reasons.

### Paths — `paths.ts`

`normalizeScopedPath` (percent-decode with bounded passes, query/fragment
strip, `..`/`.`/backslash/NUL rejection), `checkPathPermitted(scope, path)`
(denied prefixes always win; malformed deny entries fail closed),
`pathMatchesScopeEntry`.

### Packs & alias — `packs.ts`, `target-alias.ts`

`checkPackAuthorization` (unknown → `pack_unknown`, out-of-scope →
`pack_not_permitted`, no common method → `method_not_permitted`),
`resolvePermittedMethods` (manifest ∩ scope), `checkMethodPermitted`,
`resolveTargetServiceAlias` (`demo` → `target-lab`, anything else → `null`),
`checkTargetAliasPermitted` → `unsupported_target_kind`.

### URL policy — `url-policy.ts`

| Export | Purpose |
|---|---|
| `isIpLiteralHost(host)` | Every numeric address spelling: dotted/short/octal/hex/integer IPv4, bracketed/bare IPv6, IPv4-mapped. |
| `isDangerousHostname(host)` | IP literals + `localhost`, `*.local`, docker-internal, cloud metadata names, wildcards. |
| `assertSafeHostname` | Same → `unsafe_hostname` reasons. |
| `isBlockedResolvedAddress(ip)` | Post-DNS defense in depth: loopback/RFC1918/link-local/metadata/CGNAT/multicast/reserved/doc ranges, IPv6 equivalents, mapped-IPv4. For non-lab target validation only — the lab alias path never uses it. |
| `isHostInScope(host, allowedHosts)` | Exact, case-insensitive, trailing-dot-normalized match. No implied subdomains. |
| `canonicalizeHttpsUrl(raw)` | HTTPS-only, default port, no userinfo, safe hostname. |
| `evaluateRedirect(input)` | Re-checks a `Location` target: no scheme change, no userinfo, in-scope host, in-scope path, hop cap (`MAX_REDIRECTS = 3`). |
| `checkUrlAllowed(rawUrl, scope)` | Canonicalize + host-in-scope + path policy in one call. |

### Redaction — `redaction.ts`

`redactHeaders` (sensitive names + secret-shaped values), `redactUrlValue`
(drops query/fragment/userinfo), `redactText` (Bearer/Basic/JWT/PEM/AWS/
GitHub/Slack/etc. + `key=value` secrets, bounded output), `redactValue`
(deep object walk: sensitive keys, secret-shaped strings, circular-safe,
non-plain objects → placeholder), `redactModelText`, `isSensitiveHeaderName`,
`isSensitiveKey`, `looksLikeSecret`, `REDACTED_VALUE`.

### Proposal validation — `proposal.ts`

`validateModelProposal(raw)` → typed `{ok, proposal}` or
`{ok:false, rejectionCode, detail}` using the contract's
`ProposalRejectionCode` (`empty_proposal`, `stale_version`,
`forbidden_field` for injected keys, `unknown_pack`, `schema_mismatch`).
Fixed check order ⇒ deterministic audit codes.

### Test fixtures — `@highcastle/security/testing`

`makeDemoScope/Project/Target/Environment`, `makeValidProposal`, `DEMO_IDS`,
`DEMO_NOW` — a structurally valid H demo authorization whose `scopeHash`
always matches content (mutate to test tamper detection). For consumer
lanes' tests only; not a runtime dependency.

## What this package does NOT do

- It does not enforce runtime containment — Docker egress, mounts, cgroup
  limits and kill/cleanup are L14/L19. A policy `allow` is necessary, never
  sufficient.
- It performs no DNS resolution — resolved IPs are classified via
  `isBlockedResolvedAddress` by the caller.
- It does not store audit rows — `PolicyDecision` is shaped for persistence
  by L02/L17 (`policyHash`, `policyVersion`, bounded reason details).
- It holds no credentials — runner auth uses opaque `CredentialRef` handled
  by L14's controller.

## Commands

```bash
pnpm --filter @highcastle/security typecheck
pnpm --filter @highcastle/security test
pnpm --filter @highcastle/security build
pnpm --filter @highcastle/security lint
```

The scripts build `@highcastle/contracts` first so typecheck/test resolve
the same `dist/` surface consumers see.
