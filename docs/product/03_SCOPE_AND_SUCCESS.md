# Hackathon Scope, Out-of-Scope & Acceptance Gates

**Competition:** Vultr Agent Rush / Challenge 1: Blast Radius Zero. Online Nov 3–8, 2026; submission listed as Nov 9 00:00 West Africa Time in supplied brief. Confirm current deadline on official site before final submission. Required: Vultr VM web backend/control layer, **Vultr Serverless Inference for all agent LLM calls**, isolated real code/browser execution, public demo URL, repo+README, video with one containment event, documentation and MIT-compatible originality. Source: https://community.vultr.com/e/vultr-agent-rush-hackathon.

## MVP statement
One demo-first application with a real, bounded assessment of **broken object-level authorization (BOLA)** in a synthetic invoice SaaS; a model proposes/hypothesizes; a separate policy gate validates; a disposable executor tests; an independent oracle verifies; an original UI shows all evidence; a patch/replay check demonstrates the changed behavior; a containment test proves the sandbox cannot access forbidden host/network resources.

## Must-have acceptance criteria (H)
| ID | Acceptance |
|---|---|
| H-01 | Deployed landing and product routes on Vultr VM with reachable public URL. |
| H-02 | Single working demo project; onboarding/quick start does not require access to real users' data. |
| H-03 | Running scan returns server-persisted events visible via SSE/polling after refresh. |
| H-04 | At least one live Vultr inference call influences a bounded structured security hypothesis or test-plan selection; never disguise fixed text as AI output. |
| H-05 | Deterministic baseline: Alice accesses her own synthetic invoice successfully. |
| H-06 | Deterministic negative case: vulnerable revision responds with Bob's synthetic invoice under Alice's credentials; oracle validates owner/content, not status alone. |
| H-07 | Finding screen links directly to scan attempt, sanitized evidence, code location where supported, and 'confirmed by execution' classification. |
| H-08 | Fix prompt is generated or contextualized; patched deployment denies cross-account read while Alice's legitimate read succeeds. |
| H-09 | Replay creates a distinct attempt with an accurate before/after side-by-side verdict. |
| H-10 | A real out-of-scope test action is denied by runtime policy (network/filesystem/resource), with recorded evidence and demonstrable cleanup. |
| H-11 | Task execution is outside web/worker process, no host secrets, caps enforced; no 'mock success' event path. |
| H-12 | Cancellation/error/inconclusive cases are represented honestly. |
| H-13 | Repository documents setup, Vultr integration, original design, demo, limitations and safety boundary; video and submission assets complete. |
| H-14 | Smoke tests, typecheck, unit/integration/security tests and CI path pass (as available at integration gate). |

## Absolutely not in weekend scope
Arbitrary public-site scanning; production attack autonomy; user-supplied executable repositories; broad vulnerability taxonomy; real GitHub App PR gates; CVE feed; self-hosted model/GPU; enterprise RBAC/SSO; billing; scheduled scans; multi-tenant unrestricted sandbox; agent swarms; exploit chain synthesis; unapproved state-changing tests; marketing claims of full pentest coverage.

## Release tags (the full sitemap uses them)
- H: Hackathon demonstrable path only.
- B: Private-beta architectural target, not hackathon obligation.
- L: Public-launch target.
- E: Enterprise/expansion target.

## Fail the launch gate if
- Vultr call is stubbed while UI claims inference ran.
- 'Confirmed' finding lacks actual evidence, relevant source version and independent check.
- Sandboxed worker has Docker socket, host secrets or broad network egress.
- Runner can contact arbitrary host or redirect outside scope.
- Replay compares mismatched test identities/versions without disclosure.
- Cleanup fails or an orphan worker remains live after cancellation.
- Demo fails after browser reload because progress existed only in memory.
- The UI knowingly displays mock metrics as real.
- Any repo content derives from non-MIT-compatible Sandchest source.

## Priority ordering under time pressure
P0: backend, real inference, real executor, proof, containment.
P1: replay and compelling evidence-based dashboard.
P2: polish, responsive extras and samples.
P3: secondary test class and repository connection only if all prior gates hold.

## Definition of Done
Deployment and recording of an end-to-end rehearsal **on Vultr**, not a polished mock. Team checks submitted code commit equals deployed revision; test lab seeded with synthetic data; model/API secrets not in artifacts; all critical safety checks reproducible.
