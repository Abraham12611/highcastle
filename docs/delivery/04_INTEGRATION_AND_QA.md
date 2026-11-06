# Merge Protocol, Integration Gates, QA and Test Matrix

## Integration owner
One human coordinator with AI help owns integration branch, PR queue, versioned contracts and release decision. Parallel agent output is untrusted until reviewed. No 'merge all PRs' without dependency and test gates.

## Repository branch policy
`main` owner-controlled release. `develop` may be created for integration, otherwise designated `integration/hackathon`. `feature/lXX-name` per lane, based on pinned integration commit. Feature agents must not force-push shared branches, alter root lockfile (L01 only), or update schema (L02 only) without coordinator ticket. Squash merge conventional commits and record source/test evidence.

## Contract freeze gate
- Every module imports shared Zod validators, not duplicated enum strings.
- Migrations pass; H fixture IDs/target revisions fixed.
- API routes and event types documented.
- Sandbox controller request schema fixed and no arbitrary host fields.
- Shared UI design tokens and route contexts published.
If change required, freeze new version, notify downstream lanes and rebase PRs. Do not sneak compatibility hacks through local copies.

## Dependency-ordered integration
1. Root + packages/contracts + packages/db + security primitives.
2. Synthetic target-lab + inference adapter + test pack + sandbox controller.
3. Worker state machine + pg-boss + event transport.
4. API/auth + route guards.
5. UI shell + marketing/project/scan/findings/replay.
6. Vultr deployment + end-to-end suite.
Every merge triggers typecheck, unit, build; significant integration triggers real security smoke on Vultr.

## Test pyramid
**Contract/unit:** Zod parsing, scope intersection, redaction, oracle matrix, state transitions, finding fingerprint, usage accounting.
**DB integration:** migrations on clean database, project/workspace scoping, event sequencing, concurrent scan idempotency, finding dedup and replay relations.
**Service integration:** mocked Vultr timeout/malformed outputs; actual Vultr supported model test; sandbox launch/kill; target lab health.
**Security boundary:** denied forbidden egress and host-file access, no Docker socket/secrets, time/memory cap, cancel cleanup, prompt injection plan rejection.
**Browser E2E:** sign-in/guest demo, launch, stream reconnect, finding proof, remediation prompt copy, replay before/after, error/blocked/inconclusive UI.

## Acceptance matrix
| Scenario | Expected DB | Expected UI | Owner |
|---|---|---|---|
| New scan valid | scan queued and immutable scope | redirect live | L18/L09 |
| Model proposes valid known pack | proposal validated + model call logged | phase plan | L12/L13 |
| Model proposes forbidden tool/host | policy denied, no runner | blocked event | L13/L09 |
| Vulnerable lab BOLA | attempt reproduced + finding | red proof and trace | L11/L15/L10 |
| Patched lab | negative test denied + positive baseline passes | verified fixed | L11/L15/L10 |
| Patched lab breaks own access | regression, not fixed | repair guidance | L15/L10 |
| Test baseline fails | inconclusive | no confirmation | L15/L09 |
| Runner egress | real containment event | boundary denial | L14/L09 |
| User cancels | canceled + cleanup verified | cancellation states | L16/L09 |
| Browser refreshes SSE | cursor replay correct | no lost timeline | L17/L09 |
| Wrong workspace access | 403/404 | no evidence | L03/L18 |
| Sandbox orphan | reaped or alert | operator status | L14/L19 |
| Vultr unavailable | partial/failed | honest error | L12/L16 |
| No findings in tested scope | completed without finding | 'not secure guarantee' caveat | L10 |
| Source/target mismatch | blocked/inconclusive | re-run required | L16/L09 |

## Smoke-test workflow (illustrative)
~~~bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:security
pnpm test:e2e
# Then on deployed Vultr environment:
# start lab, run live scan, inspect real scan and containment IDs,
# apply patched lab version, replay, verify cleanup.
~~~
Bootstrap owner must make scripts actually exist; this block is not evidence they already run.

## Failure priority
P0: privilege breakout, arbitrary target execution, fake confirmed evidence, leaked secret, broken Vultr requirement.
P1: scan/replay cannot complete, event stream loses results, broken public URL, cleanup orphan.
P2: a11y issue blocking navigation, malformed tables, missing error state.
P3: extra polish, subtle animation, secondary marketing sections.
Never fix P3 while P0/P1 remain.

## Final release freeze
Only coordinator merges after final deployed E2E. Tag exact deployed Git SHA and use it for video. After freeze, accept only demonstrably necessary P0/P1 changes followed by replay of full test. Check all public links in incognito browser.

## Contingency runbook
- Model not returning valid JSON: narrow prompt; choose another available Vultr model; retain live call.
- Browser runner too heavy: use controlled HTTP test as executed code with truthful evidence.
- Coolify network problems: Compose on same Vultr VM, preserve sandbox boundary.
- OAuth incomplete: public synthetic demo path; lock private routes.
- Managed DB unavailable: secured Postgres container; document limitations and persistence.
- Short on time: eliminate second vulnerability class, CVE feed, fancy mascot and long onboarding. Never eliminate Proof Engine, containment or submitted demo.

## Team coordination
Coordinator maintains one central blocker board with owner, PR, dependency, acceptance proof. Per-PR QA report notes commands and actual output (not assumptions). All tests/fixtures use controlled source only. Before demo, run 3 rehearsals and record the final good path as backup; do not assert 'live' for prerecorded segments.
