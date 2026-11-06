# Entity Relationships, State Machines & Invariants

## Relationships
~~~mermaid
erDiagram
 USER ||--o{ WORKSPACE_MEMBER : belongs
 WORKSPACE ||--o{ WORKSPACE_MEMBER : contains
 WORKSPACE ||--o{ PROJECT : owns
 PROJECT ||--o{ PROJECT_SOURCE : connects
 PROJECT ||--o{ ENVIRONMENT : configures
 PROJECT ||--o{ TARGET : authorizes
 TARGET ||--o{ AUTHORIZATION_SCOPE : scopes
 ENVIRONMENT ||--o{ TEST_IDENTITY : holds
 PROJECT ||--o{ SCAN : runs
 SCAN ||--o{ SCAN_EVENT : emits
 SCAN ||--o{ TEST_ATTEMPT : contains
 TEST_ATTEMPT ||--o{ EVIDENCE_ARTIFACT : supports
 TEST_ATTEMPT ||--o{ CONTAINMENT_EVENT : observes
 PROJECT ||--o{ FINDING : tracks
 FINDING ||--o{ FINDING_OCCURRENCE : repeats
 FINDING ||--o{ REMEDIATION : fixes
 FINDING ||--o{ REPLAY : verifies
 SCAN ||--o{ RUNNER_INSTANCE : uses
~~~

## Scan lifecycle
~~~mermaid
stateDiagram-v2
 [*] --> draft
 draft --> preflight
 preflight --> awaiting_approval
 preflight --> queued
 awaiting_approval --> queued
 queued --> preparing
 preparing --> recon
 recon --> planning
 planning --> executing
 executing --> verifying
 verifying --> planning: more approved tests
 verifying --> finalizing
 finalizing --> completed
 preparing --> failed
 executing --> failed
 verifying --> partial
 queued --> canceled
 executing --> canceled
 completed --> [*]
 partial --> [*]
 failed --> [*]
 canceled --> [*]
~~~

**Transition constraints**
- draft→preflight: complete target/source and request.
- preflight→queued: policy valid, quota reserved, target healthy.
- queued→preparing: worker claims lease and rechecks authorization.
- planning→executing: plan hash approved by deterministic policy.
- executing→verifying: actual runner finished and artifacts persisted.
- verifying→completed: all required checks accounted for; else partial.
- any nonterminal→cancel_requested→canceled: executor terminated/cleanup signaled; audit always.
- invalid model output: bounded replan; after exhaustion partial/failed.
- scan.status != success signal; use verifier counts and coverage.

## Finding lifecycle
~~~mermaid
stateDiagram-v2
 [*] --> open
 open --> in_progress
 open --> accepted_risk
 open --> dismissed
 in_progress --> pending_verification
 pending_verification --> verified_fixed: replay negative and baseline positive
 pending_verification --> in_progress: still reproduces / regression
 verified_fixed --> reopened: later confirmed regression
 reopened --> in_progress
 accepted_risk --> open: risk acceptance revoked
 dismissed --> open: triage reconsidered
~~~

**Confidence axis** suspected | supported_by_analysis | confirmed_by_execution | not_reproduced | inconclusive. This is not a lifecycle and may change after new evidence.
**Severity axis** critical | high | medium | low | informational. This is risk impact independently from confidence.
**Remediation axis** open | in_progress | pending_verification | verified_fixed | accepted_risk | dismissed | reopened.

## Project readiness
| State | Meaning | Allowed UX |
|---|---|---|
| draft | project created | complete setup |
| source_connected | code available only | source recon |
| target_pending_verification | URL submitted | verify control |
| target_verified | identity checked | configure scope |
| authorized | scope recorded | preflight |
| ready | all run prerequisites valid | start assessment |
| needs_attention | broken target/credentials/revocation | repair setup |
| paused | manually suspended | view history |
| archived | historical only | restore (where permitted) |
Database may store `lifecycle` plus derived readiness rather than redundant mutable enums. H demo uses simplified ready/draft but UI copy preserves distinction.

## Test attempt lifecycle
proposed → validated or blocked → queued/running → completed | timeout | failed | canceled → independent_verification verdict reproduced | not_reproduced | inconclusive. A blocked policy operation is not a vulnerability finding. Never mark a test confirmed because stdout contains expected prose.

## Runner lifecycle
allocated → created → running → stopping → destroyed → cleanup_verified; abnormal path error → forced_stop → cleanup_verified or operator_alert. After scan cancel, controller must prevent any further tool tasks and janitor handles orphans.

## Replay invariant
Replays reference original attempt and immutable test pack version; validated patched revision, scope and identities. Verdict matrix:
| Unauthorized read on patch | Legitimate own read | Verdict |
|---|---|---|
| Yes | any | still_vulnerable |
| No | Yes | verified_fixed |
| No | No | regression |
| uncertain | any | inconclusive |
| any | uncertain | inconclusive unless still vulnerable independently proven |

## Data visibility invariants
A workspace can see only its own projects. A scan belongs to exactly one project and one authorization snapshot. Evidence is fetched by authenticated workspace-scoped route and checked for exact scan/attempt relation; signed external URLs short lived. A public demo has separate synthetic immutable tenant, not a shortcut to view private scans.
