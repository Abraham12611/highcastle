# Durable Events, Queues, Retries, Streaming & Cleanup

## Why async
Security scans require model calls, container provisioning and actual test execution. Never run as a single synchronous request; user browser can disconnect. Use pg-boss (Postgres-based) for jobs and scans/scan_events for human-visible state.

## Event catalog
| Event | Producer | Consumers | Data minimized |
|---|---|---|---|
| workspace.created | onboarding | dashboard/audit | workspace ID |
| project.created | projects | setup | project ID |
| source.connected | GitHub integration | recon queue | source ID/ref |
| target.verified | verification | readiness | target ID |
| scope.approved | policy | scan eligibility/audit | scope hash |
| scan.requested | scan API | pg-boss | scan ID, scope ID |
| scan.started | worker | live UI, audit | scan ID, runner |
| scan.stage.updated | orchestrator | SSE UI | phase, safe summary |
| test.approval_required | controller | approvals | proposal hash |
| test.executed | runner adapter | oracle | attempt ID + artifact refs |
| sandbox.action_blocked | sandbox controller | containment tab/audit | rule ID, runner ID |
| finding.confirmed | verifier/finding service | dashboard/notifications | finding ID |
| scan.completed | worker | UI/report/usage | coverage counts |
| scan.failed | worker | UI/recovery/operator | safe code |
| remediation.created | fixes | finding history | remediation ID |
| replay.completed | verifier | finding workflow | replay ID/verdict |
| finding.verified_fixed | finding service | dashboard/notification | finding ID/replay |
| github.pr.updated | webhook (B) | CI queue | repo/PR/head SHA |
| schedule.due | scheduler (B) | scan queue | schedule ID |
| integration.revoked | integrations (B) | cancel source work | install/source IDs |
| workspace.emergency_stopped | policy/operator | all runners | workspace ID |

## Job queue types (H)
- `scan.plan_and_execute` keyed by scan ID, max attempt bounded.
- `scan.cancel_and_cleanup` keyed by scan ID, high priority.
- `scan.finalize` idempotent scan aggregation.
- `replay.execute` keyed by replay ID.
- `sandbox.orphan_reap` periodic.
- `evidence.retention_cleanup` periodic (optional H).
Later B: `github.pr.check`, `schedule.dispatch`, `report.generate`, `notification.deliver`.

## Exactly-once illusion via idempotency
Distributed systems deliver at least once; design idempotent handlers.
- Unique scan key per workspace + request idempotency header.
- Worker CAS transition from queued to preparing, not blind set.
- Unique event sequence and attempt key.
- Duplicate job/runner response does not double-count findings.
- Upsert finding by project + stable fingerprint; store separate occurrence.
- Finalize only once per scan terminal transition.
- Retry keeps immutable scope and version; revalidate before launching again.

## Proposed worker lifecycle
~~~mermaid
flowchart TD
 A[Claim job] --> B[Read scan + scope snapshot]
 B --> C{Still authorized?}
 C -->|No| D[Terminal blocked + audit]
 C -->|Yes| E[Set preparing + event]
 E --> F[Call Vultr inference]
 F --> G{Structured plan valid?}
 G -->|No| H[Bounded retry / partial]
 G -->|Yes| I[Policy check]
 I --> J{Allowed?}
 J -->|No| D
 J -->|Yes| K[Create sandbox]
 K --> L[Execute bounded pack]
 L --> M[Persist sanitized result]
 M --> N[Deterministic oracle]
 N --> O[Finding / report]
 O --> P[Stop/destroy sandbox]
 P --> Q[Terminal complete + release budget]
~~~

## Retry policy
- Model temporary 429/503: jittered backoff, max attempts, respect provider rate-limit; don't endlessly bill/run.
- Malformed model plan: at most 1–2 bounded replans with explicit schema error, then inconclusive/failed.
- Sandbox creation error: retry if safe and no orphan; verify cleanup before new spawn.
- Test timeout: do not automatically extend beyond policy; record inconclusive and terminate.
- Target 5xx: distinguish unhealthy app vs legitimate security test; baseline failure → inconclusive.
- Persistence failure: stop further actions and retain temporary cleanup logs.
- Cancellation: cancellation token checked before every model request/test step, controller kills runner. Never mark completed after cancel requested.
- Leased orphan job: janitor checks runner ID/container labels; kills old run before retry.

## Event ordering and SSE
- Every state transition writes a scan_event transactionally with the state update where practical.
- seq increases monotonically; worker can call DB next sequence/transaction lock.
- SSE endpoint first returns persisted events after cursor, then streams/polls new events. No model chain-of-thought data.
- Browser reload uses last event sequence; deduplicate by scanId + seq.
- All UI progress derived from actual persisted events, not synthetic intervals.
- Progress 5/6 phases is optional and must reflect completed canonical phases; no fake percentages.

## Event examples
~~~json
{"seq":1,"eventType":"scan.started","phase":"preparing","safeSummary":"Preparing authorized lab assessment"}
{"seq":2,"eventType":"scan.stage.updated","phase":"planning","safeSummary":"Requesting security hypothesis via Vultr"}
{"seq":3,"eventType":"test.plan.validated","phase":"planning","safeSummary":"Authorized invoice ownership check approved"}
{"seq":4,"eventType":"test.executed","phase":"executing","attemptId":"...","safeSummary":"Cross-account response recorded"}
{"seq":5,"eventType":"finding.confirmed","phase":"verifying","safeSummary":"Ownership bypass reproduced with synthetic records"}
{"seq":6,"eventType":"sandbox.action_blocked","phase":"executing","safeSummary":"Out-of-scope network attempt denied by runtime"}
{"seq":7,"eventType":"scan.completed","phase":"finalizing","safeSummary":"Results and evidence saved"}
~~~

## Cancellation / cleanup contract
1. User POSTs cancel.
2. DB updates cancel_requested_at; enqueue immediate cancellation.
3. Controller prevents new actions and signals runner.
4. Kill with grace then force; detach network/remove container.
5. Verify no matching active container; record cleanup_verified_at.
6. Preserve sanitized evidence and audit; scan status canceled or partial; release budget.
7. Independent janitor periodically cleans orphans and alerts on failure.

## Observability fields
trace_id, workspace_id (redacted in third-party logs if needed), scan_id, attempt_id, runner_id, event_seq, policy_hash, model, request latency, token counts, runner exit status, resource usage, cleanup result. Never log auth headers, raw cookies, test identity secrets or full source.
