# Deterministic Security Test Pack, Oracle & Replay Protocol

## Goal
Prove one real security property in a deliberately vulnerable **owned synthetic** SaaS application: a user's object-level authorization cannot be bypassed to read another user's private invoice.

## Test lab design
Use a tiny Next.js/HTTP application with invoice endpoint and separate synthetic accounts. DB fixtures:
- Alice: user_A, tenant_A, private invoice_A.
- Bob: user_B, tenant_B, private invoice_B.
- Vulnerable image/revision `lab-v1-vulnerable`: invoice lookup uses ID alone and forgets to enforce authenticated ownership/tenant.
- Patched image/revision `lab-v2-patched`: invoice lookup applies authenticated ownership/tenant condition, denies unauthorized reads.
- No real payment system, no external APIs, no real emails, no live customer records.
- Fixed set of known IDs; never brute-force or enumerate unknown users.

## Pack contract: bola-invoice-v1
~~~json
{
  "packId": "bola-invoice-v1",
  "version": "1.0.0",
  "targetKind": "owned_demo_lab",
  "category": "broken_object_authorization",
  "requiredRoles": ["alice","bob"],
  "permittedMethods": ["GET"],
  "maxRequests": 8,
  "maxDurationSeconds": 30,
  "oracleVersion": "bola-oracle-v1",
  "mutating": false
}
~~~

## Ordered assertions
**Precondition P0:** target deployment revision matches scan snapshot and known test fixture version.
**Baseline P1:** Alice signs in with synthetic test capability and GETs invoice_A → authorized response with owner Alice.
**Fixture P2:** Bob's record is known from trusted fixture, not inferred from model generated text.
**Security S1:** using the same Alice session, GET invoice_B via known ID.
**Vulnerable detection:** if S1 actual response includes Bob's protected synthetic invoice and P1+P2 succeeded, vulnerability reproduced.
**Patched success:** if S1 denied (e.g., 403/404) AND P1 succeeds, the specific known cross-account vulnerability is not reproduced. Do not require exact code if policy chooses 404.
**Unexpected:** target 500, mismatched identity, bad fixtures, timeout, missing evidence → inconclusive, not passed.

## Verdict matrix
| P1 own access | S1 cross-account | Verdict | Meaning |
|---|---|---|---|
| Pass | Bob data returned | reproduced | confirmed BOLA for synthetic fixtures |
| Pass | correctly denied | not_reproduced | specific check passed |
| Fail | any | inconclusive | baseline broken |
| Pass | ambiguous/5xx/timeout | inconclusive | insufficient evidence |
| Unknown | any | inconclusive | can't verify |
Replay after patch uses same matrix, with correct denial + own-access pass → verified_fixed.

## Real execution artifacts
- Immutable attempt ID and target image digest; runner/container ID.
- Captured timestamped request method, path (no real creds), response status, selected sanitized body fields, body hash.
- Authentication role identity/fixture IDs (not actual tokens).
- Per-assertion pass/fail and oracle version.
- Source code file/line for demo app if mapped.
- Runner limits/exit status, containment events, cleanup state.
- Optional Playwright screenshot showing Alice logged in; does not substitute for server oracle.
- Digest SHA256 of artifact for integrity; app should show redacted evidence only.

## Replay and PatchProof
1. Open finding → user requests replay.
2. API requires updated target snapshot and active scope; check original attempt exists and was confirmed.
3. Create replay entity linked to original attempt/scan and patched revision; queue new runner.
4. Execute exactly same versioned test pack, independently of original result.
5. Compare baseline and cross-account observed results; don't compare text summaries.
6. If cross-account access denied and own access works → set replay.verified_fixed, update finding.
7. If still reads Bob → still_vulnerable; if both denied → regression; if ambiguous → inconclusive.
8. Preserve original proof and replay evidence side by side; never rewrite old attempt.

## Harmless containment experiment
**Network:** run a known benign attempt to access a fixed, out-of-scope address from inside the executor (not the host); firewall/network denies. Alternatively inspect a deliberately inaccessible path inside sandbox; choose test that verifiably fails due to enforced isolation rather than a missing file. Record actual runtime attempt, deny rule, exit/output, runner ID and cleanup.
**Time/resource:** an optional bounded CPU loop demonstrates timeout, but no need to risk VM stability. Unit and integration tests assert container is destroyed after denial.
The controller must not just return a fabricated 'blocked' JSON response; capture evidence from actual sandbox/network enforcement.

## Safety checks
- Hardcode/signed allowlist for H lab; no user-supplied target URL passed to runner.
- Test identity secret limited to synthetic fixture. No external cookies.
- Runner does not receive Vultr credentials or database keys.
- Worker/client cannot set oracle.verdict directly through API.
- Host and executor network separate; cannot access localhost/metadata/control plane.
- Redirect outside scope denied before follow.

## Testing strategy
**Unit:** oracle matrix, stable finding fingerprint, Zod pack validation, budget intersection, redact headers.
**Integration:** run vulnerable fixture → reproduced; run patched fixture → not_reproduced; baseline broken → inconclusive.
**Isolation:** no network to forbidden host; cannot read injected fake secret on host; time limit stops runaway runner; cleanup verified.
**E2E:** browser starts scan, sees real event sequence, opens finding, triggers replay, sees positive+negative results. No fixture-only 'fake live' page.
**Golden evidence:** snapshot normalized redacted result shape, not raw auth headers.
