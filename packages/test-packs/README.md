# @highcastle/test-packs — bola-invoice-v1 (L15)

Deterministic BOLA security test pack and independent verification oracle
against the owned synthetic invoice lab (L11).

- Pack: `bola-invoice-v1` v`1.0.0`, oracle `bola-oracle-v1`.
- Proves one property through **observed application behavior**: with
  Alice's synthetic session, Bob's known invoice is readable on the
  vulnerable revision and denied on the patched revision — while Alice's
  own invoice keeps working on both.

## Run

```bash
pnpm --filter @highcastle/test-packs test
pnpm --filter @highcastle/test-packs typecheck
pnpm --filter @highcastle/test-packs lint
pnpm --filter @highcastle/test-packs build
```

Wire tests boot an in-package stub lab (see `src/test/stubLab.ts`) on
loopback — no external target, no network beyond localhost.

## Programmatic use

```ts
import { runBolaPack, adjudicateReplay, toSandboxResult } from "@highcastle/test-packs";

const run = await runBolaPack({
  baseUrl: "<controller-pinned lab URL>",
  aliceCredential: "<resolved server-side from ref:synthetic:alice>",
  expectedRevision: "lab-v1-vulnerable", // or "lab-v2-patched" on replay
});

run.adjudication.verdict; // "reproduced" | "not_reproduced" | "inconclusive"
adjudicateReplay(run.adjudication).replayVerdict; // "verified_fixed" | …

const result = toSandboxResult(run, { runnerId, nonce }); // SandboxResult
```

## Versioned steps (7 requests, budget 8 / 30s)

| Step | Request | Graded |
|---|---|---|
| P0-health | `GET /health` | revision echo + liveness |
| P0-ready | `GET /ready` | fixture seed |
| P0-meta | `GET /api/meta` | fixture version/set + P2 manifest |
| setup-login | `POST /api/auth/login` | setup prerequisite (counted, not a test action) |
| setup-whoami | `GET /api/auth/whoami` | session is Alice's |
| P1 | `GET /api/invoices/invoice_A` | baseline: Alice's own invoice |
| S1 | `GET /api/invoices/invoice_B` | cross-account attempt, same session |

Only the two known fixture IDs are requested. No enumeration.

## Verdict rules (oracle, `src/oracle.ts`)

| P1 own access | S1 cross-account | Verdict |
|---|---|---|
| pass (200 + Alice identity) | Bob data returned (200 + `invoice_B`/`user_B`/`tenant_B`) | `reproduced` |
| pass | clean denial (403/404, no invoice data) | `not_reproduced` |
| fail/unknown, or any failed precondition | any | `inconclusive` |

HTTP 200 alone never classifies. Failed preconditions (wrong revision,
fixture drift, broken baseline, 5xx, ambiguous body) force
`inconclusive`. Replay verdicts reuse the canonical contract matrices.

## Cross-team interfaces (read-only)

| Lane | Interface used |
|---|---|
| L11 lab | HTTP surface + `x-target-lab-revision`, fixture manifest |
| L03 contracts | `TEST_PACK_MANIFEST`, `evaluateAttemptVerdict`, `evaluateReplayVerdict`, `SandboxResult`, `VerificationVerdict`, `CredentialRef` |
| L04 policy | budgets within sandbox/scope hard caps; redaction before hashing |
| L14 runner | `toSandboxResult` evidence; controller resolves credential refs, pins digests |
| L16 orchestrator | `PackRunResult`, replay adjudication; original attempts immutable |

## Evidence hygiene

Recorded artifacts carry method, redacted path, status, SHA-256 over
sanitized bytes, and truncated excerpts only. `authorization`, `cookie`
and `set-cookie` values, fixture tokens and session ids are replaced
with `[REDACTED]` before hashing or storage.
