# System Architecture — HighCastle

## Architecture thesis
Use a **modular TypeScript monorepo and one durable Postgres-backed job system**, not microservices for the hackathon. The app/control plane is deployed on Vultr VM; *all* agent LLM calls go to Vultr Serverless Inference; the runner executes in separate, short-lived sandboxes with an explicit allowlist to a synthetic target. A model is never an authorization system.

~~~mermaid
flowchart TD
 U[Browser: Landing + Dashboard] -->|HTTPS| W[Next.js web/control API on Vultr VM]
 W --> BA[Better Auth session]
 W --> P[Policy and scope service]
 W --> DB[(Vultr Postgres)]
 W --> Q[pg-boss Postgres queue]
 Q --> OR[Dedicated worker/orchestrator on Vultr VM]
 OR -->|server-only authenticated| INF[Vultr Serverless Inference]
 OR --> P
 OR --> SB[Sandbox controller]
 SB --> RUN[Ephemeral unprivileged executor]
 RUN -->|allowlisted network| LAB[Owned synthetic target-lab]
 RUN --> EV[Result and containment stream]
 EV --> VE[Deterministic verification oracle]
 VE --> DB
 OR --> DB
 DB -->|SSE replay| W
 W -->|Authorized signed download| OBJ[(Evidence artifact store)]
~~~

## Logical module boundaries
| Module | Process/package | Main responsibilities | Cannot do |
|---|---|---|---|
| Web and user API | apps/web | auth, RBAC, project/scan CRUD, SSE, controlled demo | execute agent scripts in request |
| Worker | apps/worker | queue claim, orchestration, model calls, retry, cleanup | override policy |
| Contracts | packages/contracts | Zod request/event/plan schemas | network or DB calls |
| Database | packages/db | Drizzle schema, queries, migrations | accept unscoped entity IDs |
| UI | packages/ui | design system + presentation | declare security verified |
| Inference | packages/inference | Vultr client, prompts, validation, provenance | contain tool execution |
| Security | packages/security | target/role/policy checks, safe URL validation, redaction | rely on LLM for scope |
| Sandbox | packages/sandbox | executor spawn/kill/limits/cleanup, policy | read privileged DB secrets from executor |
| Test packs | packages/test-packs | scripted bounded tests + deterministic oracles | expand target or exploit unrelated sites |
| Target lab | apps/target-lab | intentional BOLA vulnerability + patch variants, synthetic fixtures | access production/customer data |
| Infrastructure | infra | Vultr VM, Docker networks, storage, deployment | enable default unrestricted egress |

## Critical trust boundaries
T1 Browser (untrusted input) → web API (auth+Zod+RBAC).
T2 Web/control API → Postgres jobs (durable, exact scope snapshot).
T3 Worker → external model (model receives *minimal, sanitized* context; never credentials).
T4 LLM output → structured planner response (untrusted), then deterministic policy validation.
T5 Policy controller → isolated executor (sandbox has *no* cloud credentials, Docker socket or host FS).
T6 Executor → owned target-lab (allowlisted address/port; no general internet/DNS).
T7 Executor output → verification (treat stdout/HTTP/DOM as untrusted data).
T8 Verifier → immutable evidence/findings (model narrative cannot rewrite oracle verdict).
T9 Protected evidence store → browser (workspace-scoped authorized download; sanitize).
T10 Operator endpoint → sandbox emergency stop (audited privileged action).

## Exact H demo execution
1. User chooses owned lab, confirms locked scope.
2. POST /scans creates immutable scan, emits scan.requested + queues job.
3. Worker captures lab revision and policy version.
4. Worker asks Vultr inference for concise structured hypothesis: 'Check ownership check on invoice lookup', with possible alternatives limited to supplied test pack.
5. Zod parses/validates. Invalid action -> reject/replan bounded number of attempts.
6. Controller provisions ephemeral runner with caps and isolated allowlisted network to target-lab.
7. Test pack logs Alice in (synthetic), reads own invoice baseline, reads Bob invoice via same authenticated identity, records response.
8. Independent oracle compares known fixture ownership and response body; confirms BOLA only if *actual cross-owner data* was returned.
9. Worker persists attempt, sanitized evidence and status, releases container, updates finding.
10. UI consumes event stream; user opens proof, copies fix prompt.
11. Patched target revision deployed; replay runs exact same test pack; negative access denied and own access succeeds; finding verified fixed.
12. Separate harmless forbidden network/filesystem action demonstrates runtime denial, recorded in containment ledger.

## Data-flow and lifecycle rules
- Source snapshot SHA and target image digest are captured before test.
- Scope hash attached to every attempt; changing scope requires new approval/version.
- Job owns cleanup in finally and an independent janitor reconciles orphan sandboxes.
- Every model call stores provider, model identifier, request/response trace metadata **without raw secrets**.
- Store proposal/test/verification as distinct entities/events.
- Demo should return truthful partial results on model, worker, target or DB failure.
- No unrestricted shell in public request.
- All active test code runs with non-root UID, read-only root FS where possible, tmpfs writable scratch, dropped capabilities, pid/memory/cpu/time constraints, network isolated to lab via enforced network rule. Egress deny must be tested, not merely configured.

## Modular monolith advantages
The application and worker share contracts/DB/security packages, enabling 10–20 AI agents to work on separate modules without premature distributed systems. Deployment may use separate web and worker containers on same Vultr VM under Coolify or Compose. The target lab is a separate restricted container/service; runner never shares application process or privileged resources.

## Production later (not hackathon)
Dedicated isolated workers/VMs per customer, stronger gVisor or microVM boundaries, private regional deployments, audit store, deployment integrations, general stack provisioning and scheduling. H must not accept arbitrary uploaded untrusted code for execution.
