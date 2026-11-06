# Critical Security Contract — Authorization, Containment, Policy

This is a release-blocking specification. Every AI engineer must read before touching agents, network, infra or execution. A 'safe' prompt is not a sandbox. Vultr VM provisioning is not a sandbox by itself.

## Authorization model
1. **Actor** (who requests): authenticated workspace user with scan permission.
2. **Source** (what code may be read): selected immutable repo/fixture only, independent GitHub App permission later.
3. **Target** (what environment may be tested): verified owned lab/staging, canonical origin/service name, specific route/method scope.
4. **Test class** (what action): enumerated pack IDs and permitted methods.
5. **Test identity/data**: synthetic tenant fixtures; no production credentials.
6. **Execution budget**: timeout, requests, CPU, memory, processes, concurrency, model calls.
7. **Approval**: signed-in human actor approves exact scope/version and expires; policy can revoke.
8. **Evidence**: record scope hash on every scan/attempt and rejected action.

For H only one permitted lab target. No arbitrary target host in public API or LLM plan. Domain verification alone does not authorize testing a third-party shared infrastructure service.

## Threat-bearing URL handling (future)
Canonicalize scheme/hostname/port; HTTPS default; disallow credentials/userinfo; resolve A/AAAA and check all IPs against allowed CIDRs; reject loopback/private/link-local/metadata except explicitly controlled enterprise scope; re-check redirects, DNS rebinding and connection destination at runtime. Runner network layer enforces allowlist independently. Never let URL query override host/port.

## Policy precedence
Operator hard caps → project/target authorization → signed scan snapshot → specific user approval → test pack declaration → model-requested action. **Intersection only**: model may narrow choices but cannot broaden. If any policy missing/expired, deny.

## Sandboxing baseline (H known test packs)
- Trusted controller talks to container runtime; only controller can create/kill.
- Ephemeral runner non-root, no new privileges, all capabilities dropped, seccomp/AppArmor where available.
- Read-only root, sized tmpfs, no bind mount from host, no docker.sock.
- Cgroup CPU/memory/process/time caps; per-action network rate/request limit.
- Separate control and lab networks; runner may reach only approved synthetic target, not worker/DB/metadata/public Internet.
- No cloud secrets, OAuth tokens, DB keys, user source or host env injected.
- Container instance unique per attempt or scan according to documented policy, always terminated; janitor verifies cleanup.
- Browser cookies scoped to synthetic test app only and redacted from log.
- Assert real limitation with controlled attempted outbound/FS action, record actual denied output.

## Runtime architecture
~~~mermaid
flowchart TD
 A[User approved scope] --> B[Signed immutable scope snapshot]
 B --> C[Planner request]
 C --> D[Zod validated plan]
 D --> E[Deterministic policy engine]
 E --> F{Within intersection?}
 F -->|No| G[Deny + audit + no runner call]
 F -->|Yes| H[Trusted sandbox controller]
 H --> I[Ephemeral restricted executor]
 I --> J{Egress / process compliant?}
 J -->|No| K[Enforced deny / kill / containment artifact]
 J -->|Yes| L[Owned synthetic lab request]
 L --> M[Observed output]
 M --> N[Independent oracle]
 K --> N
~~~

## Controls by execution phase
| Phase | Must enforce | Evidence |
|---|---|---|
| Accept job | auth, workspace, scope, quota | scan config snapshot |
| Plan | model input minimization, schema | model_call + proposal |
| Approve | exact signed allowed plan and budget | policy decision |
| Provision | image allowlist, sandbox limits | runner instance record |
| Execute | egress + syscall/resource/network enforcement | runtime logs, containment |
| Verify | pure deterministic oracle, fixture version | assertion results |
| Persist | redact/ACL/hash | evidence_artifact |
| Cleanup | forced stop/remove, zombie reconcile | cleanup_verified |
| Replay | unchanged test pack, fresh scope on new target | replay record |

## Prohibited H operations
- Arbitrary production target URL.
- Privileged containers, host file mounts, Docker socket in worker-facing untrusted code, metadata endpoint, external shell/network tools.
- User-supplied code execution and third-party dependency install in runner.
- Brute force, denial of service, destructive schema mutation, actual credential harvesting.
- Letting model choose arbitrary hosts/routes, invoke Vultr API directly, or reveal secret refs.
- Treating blocked action as a vulnerability in target app; it is **containment evidence**.

## Positive and negative security tests
- Allowed synthetic invoice read works from runner (proves environment reachable).
- Disallowed hostname / metadata IP fails from runner with actual policy signal.
- Attempt to read a named fake host-only file fails due to mount restriction.
- CPU/resource loop stopped within hard bound.
- Container has zero provider secrets in env.
- Runner cleanly destroyed after success, denial, timeout and cancellation.
- Model injected with 'use another URL' proposal rejected.
- User supplies another project ID / another workspace artifact ID → denied at API.

## Deterministic findings
'Confirmed by execution' requires recorded runtime result, source/target version, scope, independent oracle. LLM decides **what to investigate** and **how to explain**, not whether it is allowed and not whether evidence meets a boolean invariant. If verification incomplete, classify inconclusive.

## Emergency stop
Workspace or operator can trigger stop: mark scope revoked, prevent new work, cancel all pending jobs, kill running executors, record event, verify no orphans. Emergency stop must work even if user closes UI. Owner can restore only after new preflight and reauthorization.

## Compliance and liability boundaries
This is a limited research/prototype testing platform. Never imply universal safety. Respect explicit authorization and third-party terms; only run known harmless test scenarios against owned synthetic lab during hackathon. Audit actor/time/scope and maintain provenance.
