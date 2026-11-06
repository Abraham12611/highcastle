# Ideal Customer Profiles, Personas & Modes

## ICP 1 — Vibe coders shipping real products (PRIMARY)
**Who:** nontechnical founders, indie makers, AI-assisted app builders on low-code/AI coding platforms. They may have users, user-generated content, subscriptions, private dashboards or payments, but little security knowledge.

**Job:** 'Tell me if I made a dangerous mistake before I invite users—and explain exactly how to fix it.'
**Trigger:** prelaunch, first customer data, investor/customer security question, newly built authentication.
**Barriers:** inability to run shell commands; no dedicated security staff; fear of breaking production.
**Preferred entry:** high-trust preflight flow, verified app URL or integrated source, default synthetic staging.
**Outcome:** human-language finding, observable proof, copyable coding-agent fix prompt, retest.
**Never imply:** entering any URL authorizes attack or URL-only scans equal full pentests.

## ICP 2 — AI-assisted engineers & solo SaaS founders (CO-PRIMARY DESIGN PARTNERS)
**Who:** full-stack developers using Cursor, Claude Code, Codex or similar tools.
**Job:** 'Catch security regressions without slowing CI and prove the patch works.'
**Trigger:** new PR, auth/data access change, pre-release, suspicious bug.
**Preferred entry:** repository connection, target mapping, branch and test pack selection.
**Outcome:** line-referenced path, deterministic repro, GitHub Check (beta), test artifact and replay.
**Why first beta partners:** can supply a safe staging deployment and interpret test false positives.

## ICP 3 — Agencies & studios
**Job:** 'Ship multiple client apps with defensible testing evidence and low rework.'
**Needs:** workspace/repository segregation, account permissions, client-facing reports, workflows, scheduled scans, evidence retention. Later beta/launch.

## ICP 4 — Startup engineering/security
**Job:** 'Enforce a reproducible security gate for important app changes.'
**Needs:** reliable CI checks, risk-based policy, issue triage, audit history, SSO eventually.

## ICP 5 — Enterprise AppSec/platform
**Job:** 'Expand coverage while preserving sensitive data/infrastructure controls.'
**Needs:** private workers, self-hosted execution, SSO/SCIM, RBAC, policy management and data retention. Expansion, explicitly not hackathon.

## Persona comparisons
| Persona | Comfortable with Git? | Needs plain language? | Primary flow | Main value |
|---|---|---|---|---|
| Nontechnical founder | Often no | Yes | URL/Guided Builder | Confidence before launch |
| Vibe coding power user | Sometimes | Yes | Repo or URL | Fix via coding agent |
| Solo engineer | Yes | Optional | Repo/Developer | Repro and regression |
| Agency lead | Yes | Mixed | Team projects | Client assurance |
| Security engineer | Yes | Less | Automated policy | Coverage and evidence |

## Mode invariants
- Modes share same data, routes, API and permissions. No mode-specific security engine.
- Personal preference only controls default labels, examples and detail density.
- Builder labels: 'Security checks', 'Security issues', 'Fix and retest', 'Proof', 'Testing permissions'.
- Developer labels: 'Scans', 'Findings', 'Fixes & Replays', 'Evidence', 'Scope'.
- A founder can reveal advanced technical details without switching a project or re-running a scan.
- UI must show what has *not* been tested, independent of mode.
- Never hide approval requirements in Builder Mode.

## First-run journeys
**Founder:** landing → demo → signup → personal workspace → create project → guided source/target connection → verified authorization → safe assessment → results with business impact → fix prompt → replay → monitoring.
**Developer:** landing/docs → GitHub sign-in → workspace → install GitHub App (beta) → select repo/branch → map target → default policy → scan → technical findings → patch → GitHub check/replay.
**Agency:** invite/member → switch workspace → project list → report export; roles and access are permission-checked.

## Value hierarchy
1. Actual exploit verification with reproducible evidence.
2. Accurate explanation and recommended guardrail.
3. Demonstrable before/after test for the patch.
4. Gradually, continuous checks embedded in developer workflow.
5. Eventually, multi-project/team/security operations.

## UX research questions to test after the hackathon
- Do non-developers understand 'verified staging target'?
- Can founders create synthetic accounts safely?
- How much proof is convincing without exposing reusable secrets?
- Which model-based explanations reduce time to patch?
- Would builders pay per project, per verified run, or monthly?
