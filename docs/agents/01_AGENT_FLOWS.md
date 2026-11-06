# Agent Control Flow — A01 Parent and A02–A13 Sub-Flows

## Guiding architecture
The MVP uses **one stateful orchestrator** with multiple specialized reasoning steps. Separate 'agents' in diagrams are logical capabilities, not unrestricted autonomous services. Only server-side worker talks to Vultr Serverless Inference, and only trusted controller drives sandbox. Every model-proposed plan is **untrusted** until schema and scope checks pass.

## A01: complete security assessment flow
~~~mermaid
flowchart TD
 A[Scan requested] --> B[Authenticate / authorize / scope / budget]
 B --> C{Allowed?}
 C -->|No| X[Reject or request approval]
 C -->|Yes| D[Snapshot source and target versions]
 D --> E[Reconnaissance]
 E --> F[Generate hypotheses via Vultr]
 F --> G[Propose bounded test pack]
 G --> H[Schema and deterministic scope validation]
 H --> I{Permitted?}
 I -->|No| J[Block / record / bounded replan]
 J --> G
 I -->|Yes| K[Allocate isolated runner]
 K --> L[Execute baseline and security test]
 L --> M[Capture sanitized evidence]
 M --> N[Independent oracle]
 N --> O{Verdict}
 O -->|Confirmed| P[Confirmed finding]
 O -->|Not reproduced| Q[Negative test record]
 O -->|Inconclusive| R[Review / bounded retry]
 R --> G
 P --> S[Severity, dedup, fix guidance]
 Q --> T[Aggregate results and coverage]
 S --> T
 T --> U{More approved tests?}
 U -->|Yes| F
 U -->|No| V[Finalize report]
 V --> W[Destroy runner + verify cleanup]
~~~

## A01.1 Intake, scope, approval
Trigger: manual request, future GitHub/schedule/API. Validate signed-in identity, workspace role, current project/target permission, exact authorized scope, permitted test class, fixture/account refs, resource budget, quota, stop state. Create immutable scan config and scope hash.
Failures: unauthenticated → 401; no membership → 404/403; out-of-scope target → deny; expired auth → reauthorize; no budget → 429; no safe target → preflight issue. **No runner starts** on invalid input.

## A01.2 Source/target snapshots
Capture repository SHA if present, target image digest/revision, test fixture version, network allowlist, model configuration and test pack version. Read only controlled test-lab source for H. Revalidate target revision at start; if changed unexpectedly mark inconclusive/version mismatch, not fake success.

## A01.3 Reconnaissance
Inputs: allowed code/route map, target descriptors and fixture schema. Outputs structured threat model: auth entry points, roles, data paths, trust boundaries, sensitive endpoints, owned synthetic test users, suspected authorization omissions.
Source only does not imply runtime test. H focuses invoice route and owner check.

## A01.4 Hypothesis generator (Vultr LLM)
Prompt includes permitted scope and *sanitized* relevant source. Returns schema-versioned list of candidate hypotheses, ideally with category, target component, expected secure behavior, risk explanation and allowed test-pack preference. Do not request unrestricted exploit creativity against third-party sites. Capture provider/model/latency metadata.
Fail/recovery: unavailable model, malformed JSON, policy-conflicting suggestion → bound retry or mark incomplete. Never silently substitute prerecorded model text.

## A01.5 Test planner
Choose a declared test pack such as `bola-invoice-v1`, with bounded synthetic identity/fixture mapping. Plan type enumerated with allowed methods, expected oracle and maximum budget. Test pack implementation, not model prose, defines executable code. Free-form code generation (if added later) still runs only in sandbox after stronger validation, but not needed for H.

## A01.6 Policy and safety gate
Policy is deterministic: project/target match, scope valid, host/network allowlisted, test pack approved, synthetic role handles known, deadline/request limit within max, permitted environment and current approval. Deny and record event for violations. The LLM cannot give itself new permissions.

## A01.7 Sandbox creation
Trusted controller allocates ephemeral runner with no credentials from HighCastle except synthetic lab session capability, no Docker socket, no host mounts, non-root, read-only root filesystem, cpu/pid/memory/time caps, restricted network. Controller returns runner ID, limits and status. If creation fails, mark scan failed/partial, do not execute in worker as fallback.

## A01.8 Baseline and negative test
**Before security attempt:** Alice's own invoice accessible; Bob fixture exists. **Security test:** with Alice's synthetic session request Bob's known ID in isolated lab. Record raw output transiently; sanitize before persistence. Do not rely on response status alone; independent oracle checks actual fixture ownership and returned protected synthetic fields. H can use Playwright or controlled HTTP runner; both count as real code execution.

## A01.9 Evidence collection
Record test plan hash, scope hash, target revision, actor identities, timestamps, sanitized request/response, runner exit code, stdout/stderr (sanitized), oracle assertions, artifact SHA256 and containment events. Distinguish 'model predicted' from 'runner observed'.

## A01.10 Independent verification
Trusted deterministic code—not same model—evaluates the oracle. Confirm BOLA when: legitimate own-invoice control works, Bob invoice belongs to Bob, Alice's session retrieves Bob's protected synthetic invoice, and no identity/fixture mismatch. If baseline unhealthy or ambiguous, inconclusive. If unauthorized request denied and baseline passes, not reproduced for this run.

## A01.11 Finding classification/report
Agent may explain severity and remediation, but severity is reviewable; confidence 'confirmed by execution' only if oracle. Upsert by stable issue fingerprint; attach occurrence, not new finding per scan. Explain business consequences without claiming production exfiltration. Report tested coverage and limitations.

## A01.12 Cleanup + audit
Terminate and remove container, verify cleanup, expire synthetic credentials if applicable, audit policy/runner, finalize scan. Janitor reconciles orphans. Cleanup failure is operator alert; never claim 'destroyed' on policy alone.

## A02–A13 specialized flows
| ID | Component | Inputs | Steps | Verified outputs |
|---|---|---|---|---|
| A02 | Source reconnaissance | source SHA + allowed files | discover routes→auth→trust boundaries | threat_model JSON |
| A03 | Authenticated browser | synthetic accounts+scope | sign in→assert account identity→exercise approved UI | screenshots/trace |
| A04 | Authorization testing | Alice/Bob fixtures | own baseline→cross-account request→compare | BOLA oracle |
| A05 | Evidence verification | actual responses+fixtures | normalize→assert→hash→store | confidence/verdict |
| A06 | Containment monitoring | policy+runtime | deny attempted egress/FS→log→stop as configured | containment event |
| A07 | Fix recommendation | finding+code+invariants | root cause→smallest fix→test guidance | redacted prompt |
| A08 | Patch verification | old attempt+new revision | preflight→replay→baseline→verdict | replay record |
| A09 | PR review (B) | signed webhook+head SHA | diff→risk review→preview test if allowed→GitHub Check | commit-specific status |
| A10 | Scheduler (B) | recurrence+scope | due→revalidate→queue→compare prior | scan |
| A11 | Recovery | error/lease/runner | classify failure→bounded retry or stop→cleanup | honest status |
| A12 | Report generator | findings+tests | coverage→redacted evidence→summary | report |
| A13 | Policy controller | user, scope, proposed tool | parse→verify→allow/deny→audit | signed decision |

## Containment sub-flow
~~~mermaid
flowchart TD
 A[Proposed tool action] --> B[Policy parser]
 B --> C{Allowed action?}
 C -->|No| D[Block + policy event]
 C -->|Yes| E[Run in isolated executor]
 E --> F{Runtime violation?}
 F -->|Yes| G[Kernel/network deny + terminate if needed]
 F -->|No| H[Actual output]
 G --> I[Containment evidence]
 D --> I
 H --> J[Independent verifier]
~~~

## Tools in H (limited; no generic attack API)
- `inspect_demo_source`(revision) → sanitized relevant source context.
- `describe_demo_target`(target ID) → synthetic environment+roles.
- `propose_bola_check`() via Vultr → typed hypothesis/testPack choice.
- `run_bola_invoice_pack`(scan ID, approved scope, revision) → controller executes known pack.
- `get_attempt_evidence`(attempt ID) → sanitized/hashed proof.
- `generate_remediation_guidance`(finding ID) → root cause/invariants/prompt.
- `replay_bola_invoice_pack`(finding ID, updated target rev) → new independent test.
- `run_containment_probe`(known benign denial fixture) → real runtime block.
No unrestricted terminal, arbitrary shell, arbitrary hostname or external credential authorization in H.

## Agent/reviewer safety note
Untrusted source files and webpages may contain instructions aimed at the model. They are treated as data; strip/quote relevant source, never treat it as system instruction. Tool authority is enforced by code, not prompt text. Store safe summaries, not hidden chain-of-thought.
