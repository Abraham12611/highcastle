# Quality Engineering — Test Pyramid, Commands and Acceptance Proof

## Gate definitions
F0: contract/types/schema/safety functions pass.
F1: minimal actual Vultr inference + lab/test pack/runner vertical proof.
F3: public deployed app from landing to evidence to replay.
F4: containment, cleanup, authz and report honesty verified.

## Unit test inventory
**Contracts:** wrong enum, missing scope, extra host/tool, bad model JSON, replay invalid state, event discriminated unions.
**Policy:** allowlisted controlled demo, deny arbitrary target, expired scope, wrong pack, allowed methods intersection, quota cap, target revision mismatch.
**Oracle:** vulnerable reproduced, patched not reproduced, bad baseline inconclusive, body/owner mismatch inconclusive, 5xx inconclusive, non-200 authorized access failure.
**DB:** project uniqueness, scan idempotency, seq monotonic, finding fingerprint, relations, workspace isolation.
**UI:** Builder/Developer mode labels same routes; statuses text visible; copy prompt sanitized; loading/empty/canceled/inconclusive.

## Integration
- Better Auth with Postgres session, expired/logout case.
- API 401/403/404/409/422/429 handling.
- Worker job queue reclaims after simulated restart and doesn't repeat confirmed finding count.
- Model real call and fake in test env only.
- Container controller allowed connection to lab; forbidden egress blocked; resource timeout cleanup.
- SSE event rehydration using Last-Event-ID and out-of-order network retries.
- Evidence artifact hash matches normalized bytes.

## E2E success and failure routes
1. Public landing → controlled demo → scan launch → real live steps → confirmed finding → fix guidance → patched replay → verified fixed.
2. Cancel midrun → executor stops → safe partial evidence and cleanup.
3. Model invalid output → bounded retry → partial/failure, never success.
4. Lab down → preflight blocks, no finding.
5. Runner forbidden network → containment event, no host compromise.
6. Scan with no reproduced issue → accurate coverage message.
7. Unauthorized workspace evidence ID denied.
8. Mobile scan/finding/replay accessible by keyboard/screen reader.

## CI gates
pnpm install --frozen-lockfile, lint, typecheck, test, build, test:security; E2E can run against own synthetic lab in CI if Docker available. Never inject real cloud keys into forked PR CI. A successful mocked CI doesn't replace deployed H live test.

## Safety failure kill switch
If any test demonstrates executor can reach control plane/metadata/arbitrary network or read host secret, block deployment and fix isolation before demo. If model-generated text alone can set verified outcome, block deployment. If a replay can mark fixed without baseline positive test, block deployment.

## Test provenance
Every acceptance run records git SHA, target lab image digest, pack/oracle version, Vultr model ID (for real model tests), scan/attempt/replay IDs, timestamps, runner/container ID, exact pass/fail and cleanup. Never include secrets or unsanitized user code.
