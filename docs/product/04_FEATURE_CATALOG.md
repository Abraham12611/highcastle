# Feature Catalog — Inherited Patterns, HighCastle Innovation, Release Stages

Sandchest links: scans https://www.sandchest.com/docs/scans ; findings https://www.sandchest.com/docs/findings ; fixing https://www.sandchest.com/docs/fixing ; demo https://www.sandchest.com/demo ; self-hosting https://www.sandchest.com/docs/self-hosting . Patterns are only conceptual references, not code/UI copied into HighCastle.

## Independently implemented industry patterns
| Capability | HighCastle behavior | Stage |
|---|---|---|
| Repository reconnaissance | Map routes, auth, trust boundaries, sensitive storage | H limited demo, B broader |
| Full/deep scan | Source review + verified executable tests where supported | B |
| Finding details | Severity, confidence, impact, file:line, evidence and attack path | H |
| PoC documentation | Repro steps, normalized execution trace, optional browser artifacts | H |
| Coding-agent fix prompt | Copy fix instructions with regression invariants | H |
| Fix checks | Replay original bounded test after update | H |
| Scan history | All executions, statuses, durations and version hashes | H |
| GitHub PR review/checks | Signed webhooks, changed-code analysis, status gating | B |
| CVE/advisory matching | Dependency inventory + known advisories | B |
| Deduplication | Stable issue identity across scans/commits | B |
| Scheduled scans | Recurrence with policy and quota | B |
| Developer API/MCP | Structured read/write endpoints + permissions | L |
| Teams/roles | Workspace access, permissions, invitations | B |
| Billing/credits | Transparent quota and pricing | L |
| Self-hosting | Dedicated private controller/runner, policy governance | E |

## HighCastle differentiators
| Feature | Definition | Stage | Differentiation |
|---|---|---|---|
| Proof Engine | Execute constrained security hypothesis against authorized test deployment; persist independent verdict | H | Actual execution |
| Attack Twin | Isolated disposable app copy with synthetic tenants, known revisions | H controlled; B generalization | Protect customer data |
| RoleShift | Test different synthetic roles/owners and authorization invariants | H two accounts | BOLA/business logic |
| Attack Replay | Re-execute identical recorded test with versioned inputs | H | Reproducible evidence |
| PatchProof | Attack must stop reproducing **and** legitimate operation still succeed | H | Prevent fake fixes |
| Containment Ledger | Recorded enforced sandbox blocks + resource/audit evidence | H | Prove blast radius |
| Plain-English impact | Translate verified test into consequences for founders | H | Builder accessible |
| Builder/Developer modes | Shared engine, different presentation of same evidence | H basic | Broad ICP |
| Attack-chain reasoning | Combine separately verified issues within scope | E | Compound risks |
| Business Logic Explorer | Examine app-specific economic/workflow invariants | E | Beyond linting |
| Security Memory | Retain previous paths and select relevant regression tests | B/L | Continuous intelligence |
| Dependency risk lab | Controlled execution of dependency upgrade behavior | E | Supply chain |
| Agentic AI app security | Test agent tools and role permissions | E | New risk category |
| Dynamic test policy | Human-defined scope, approvals, quota, throttles | H controlled; B configurable | Safety product |

## Scan types and scope
- Recon: source/authorized metadata map (H demo, B generic).
- Targeted red-team: selected weakness class (H BOLA).
- Deep assessment: broader code + runtime investigation (B).
- PR review: changed-surface analysis (B).
- Fix verification: replay recorded case (H).
- Prelaunch pack: selected relevant checks for small app (L).
- Scheduled, incident and AI-agent scans: later.

## Findings model
Use **three independent axes**:
- confidence: suspected | supported_by_analysis | confirmed_by_execution | not_reproduced | inconclusive
- severity: critical | high | medium | low | informational
- remediation: open | in_progress | pending_verification | verified_fixed | accepted_risk | dismissed | reopened

Never translate 'not reproduced' into 'safe'. Missing coverage is explicitly documented.

## Feature prioritization rationale
Build execution, evidence and replay before CVE feeds, agent mascots, general chat, billing, agency reporting or PR automation. A hackathon demo is won by actual behavior, not a large nav.
