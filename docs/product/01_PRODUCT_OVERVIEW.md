# Product Overview — HighCastle

## Product definition
**HighCastle — Your personal AI hacker.** A web-based autonomous application-security platform that inspects authorized applications, proposes threat hypotheses, executes bounded verification tests against isolated environments, captures evidence, explains fixes, and proves whether specific regressions stopped reproducing.

**One-sentence differentiation:** Code analysis suggests weaknesses; HighCastle's Proof Engine attempts to **reproduce** selected weaknesses safely in an Attack Twin and then **replay** them after a fix. Avoid implying Sandchest never generates PoCs; its public docs describe code-oriented findings while our differentiator is executed evidence.

## Problem
AI coding lets nontechnical founders and experienced developers ship authentication, databases and payment-adjacent workflows quickly. Security expertise and review capacity have not necessarily kept pace. Generic LLM reports can be false positive; traditional scans often lack business context; founders want to know what a vulnerability **actually allows** and whether a proposed patch closes the gap.

## North-star loop
~~~mermaid
flowchart LR
  A[Connect] --> B[Authorize]
  B --> C[Investigate]
  C --> D[Execute bounded test]
  D --> E[Independent evidence]
  E --> F[Explain and fix]
  F --> G[Replay]
  G --> H[Monitor]
  H --> C
~~~

## Product promises and limits
- We test **only authorized** applications and initially only synthetic target data.
- We label a vulnerability 'confirmed by execution' only if a deterministic oracle passes with recorded evidence.
- We never claim a passing scan proves an application has no vulnerabilities.
- URL-only scanning has less insight than source + test environment; no automatic code-line fix without source.
- HighCastle is not a substitute for professional assessment, formal certification or warranty.
- A security issue may be serious while 'suspected'; severity, confidence and remediation are distinct.
- HighCastle does not run aggressive tests against arbitrary production sites by default.

## Two experiences / one backend
**Builder Mode:** onboarding via understandable language, prelaunch security check, risk explanation in business impact, guided testing permissions, fix prompt for coding agents.
**Developer Mode:** source/commit links, attack paths, normalized HTTP traces, CI checks, scan configurations, test identities, failed assertions, structured exports.
Mode changes personal presentation only, not workspace authorization, scan evidence, product identity or persistence.

## Target objects and ownership
- User: authenticated person.
- Workspace: organization or solo account and policy boundary.
- Project: security surface for an application.
- Source: repository and immutable revision, may exist without executable target.
- Target: verified, authorized application endpoint, may exist without source.
- Environment: disposable Attack Twin/staging; has test data version and deployment reference.
- Authorization scope: approved hosts, routes, identities, test classes, limits, expiration and actor.
- Scan: immutable configuration snapshot + execution lifecycle.
- Test attempt: one bounded action with actual output and independent verdict.
- Evidence: redacted artifact with integrity/provenance metadata.
- Finding: lasting security issue across revisions, linked to many occurrences.
- Remediation: patch guidance or change associated with a finding.
- Replay: run of original test against a specific updated target.
- Integration: GitHub/deployment/notifications.
- Security policy: workspace/project execution rules, not LLM instructions.

## Competitive inspiration without copying
Sandchest patterns worth independently implementing: repository recon, deep scans, review and fix checks, finding detail with impact/path/PoC/fix prompts, GitHub review integration, CVE matching, team/credits, self-hosting later. HighCastle adds Attack Twin, real executed verification, proof replay, synthetic role testing, separate containment report, security memory and future business-logic exploration. See `04_FEATURE_CATALOG.md`.

## ICP priority
1. Vibe coders and AI-assisted indie founders (primary public positioning).
2. Technical solo founders/full-stack developers (first design partners and integration-ready users).
3. Agencies and startup engineering teams.
4. Enterprise security teams later. See `02_ICPS_AND_PERSONAS.md`.

## Product language
Use: *authorized target*, *isolated test*, *hypothesis*, *attempt*, *reproduced*, *inconclusive*, *verified fixed*, *coverage*.
Avoid: *hack any site*, *unrestricted attacks*, *100% secure*, *AI proved it* without trace, *pentest certification*.

## Hackathon reality
A controllable, intentionally flawed invoice SaaS is the target. Baseline Alice owns Invoice A and Bob owns Invoice B; vulnerable revision allows Alice to retrieve B; patched revision returns a denial while authorized reads still work. Vultr inference plans/assesses; policy code authorizes; sandbox runs real HTTP/browser operations. The demo shows an honest containment attempt blocked by runtime policy.

## Metrics
- Product: time from connecting to verified finding, false-confirmation rate, share of reproduced findings successfully verified fixed, cost per completed scan, user time to understand a finding.
- Execution: runner startup/cleanup success, scope-block ratio, verified against untrusted models, orphan sandbox count, deterministic replay reproducibility.
- Demo: real evidence before and after, authentic Vultr inference use, one containment event, deployed accessible URL.
