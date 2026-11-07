# @highcastle/sandbox — sandbox execution controller (L14)

Trusted controller + untrusted ephemeral runner for HighCastle's **only**
permitted execution path: the reviewed `bola-invoice-v1` test pack against
the owned synthetic `target-lab`. Implemented behind the frozen
`SandboxRequest`/`SandboxResult`/`ContainmentEvent`/`RunnerInstance`
contracts from `@highcastle/contracts`.

## Architecture

```
L13/L16 (frozen SandboxRequest)
        │
        ▼
SandboxController.execute(request, { workspaceId, signal? })
        │  1. Zod re-validation (strict, .parse — fail closed)
        │  2. SandboxPolicyGate.authorize()        ← L04 plugs in here
        │  3. Preconditions: docker up, lab network exists AND is internal
        │  4. CredentialResolver: ref → synthetic lab token
        │  5. docker create (buildDockerCreateArgs — pure, test-pinned)
        │  6. docker start -ai, RunnerEnvelope over stdin (secrets never env/argv)
        │  7. watchdog wait: exit | deadline | abort → SIGKILL
        │  8. parse NDJSON → SandboxResultSchema + attemptId/runnerId/nonce echo
        │  9. mint ContainmentEvent ONLY from observed probe denials
        │ 10. docker rm → docker inspect must prove absence → cleanup_verified
        ▼
SandboxExecution (denied | precondition_failed | executed{outcome,result,events})
```

Runner statuses follow the contract enum: `allocated → created → running →
stopping → destroyed/cleanup_verified | forced_stop | error | operator_alert`.

## What the runner can and cannot do

- **Can:** read the stdin envelope, run containment probes, GET four fixed
  paths on `http://target-lab:3000`, emit NDJSON evidence, exit.
- **Cannot:** be given commands/flags/hosts (contract has no such fields),
  reach any host but the lab (internal runner network + in-program
  origin allowlist), write outside `/tmp` (read-only rootfs), use privileges
  (cap-drop ALL + no-new-privileges + non-root), see host files or
  `docker.sock` (no mounts), hold provider/DB/GitHub secrets (stdin-carried
  synthetic token only), or live past the deadline (SIGKILL + janitor).

## Containment evidence — the honesty rule

`ContainmentEvent`s are minted **only** when the runner program's probes
report `outcome: "denied"` — i.e. a real attempted operation (TCP connect to
`169.254.169.254:80`, HTTP GET `example.com`, write to the read-only rootfs,
stat of `docker.sock`/host canary, read of `/etc/shadow`, `unshare --mount`,
`mknod`) was rejected by the runtime environment, and the runner returned the
observed errno. A probe reporting `breach` escalates the runner to
`operator_alert` and the attempt outcome to `containment_breach`. Nothing in
this package fabricates a denial: run the program unsandboxed and it reports
breaches and aborts (exit 3) — verified.

## Ports other lanes implement

| Port | Owner | Provided here |
|---|---|---|
| `SandboxPolicyGate` | L04 (real scope intersection) | `StaticLabPolicyGate` — local manifest/caps intersection |
| `RunnerRegistry` | L02 (durable `runner_instances`) | `InMemoryRunnerRegistry` |
| `CredentialResolver` | controller-internal | `StaticSyntheticCredentialResolver` (alice/bob fixture refs) |
| `ContainerRuntime` | L14 | `DockerCliRuntime` (docker CLI, execFile/spawn, no shell) |

`StaticLabPolicyGate` enforces everything decidable from the contracts alone
(pack id/version, method ⊆ manifest, limits ⊆ min(manifest, hard caps), alias,
digest presence). Scope-hash lookup, expiry, revocation and quota need L04 —
the gate interface is the agreed seam.

## L15 (test-pack/oracle) interface — single source of verdicts

The runner **observes**; it never certifies. L15's independent oracle owns
`reproduced`/`not_reproduced`/`inconclusive`/`verified_fixed`. Observation
schema handed to the oracle: `exchanges[]` (method/path/status/bodyHash/
redacted excerpt), `baselineAssertion`, `negativeAssertion` (passed=true ⇔
cross-account read was *denied*), `observedFixtureOwner`, plus assertion
lines `precondition_meta`, `precondition_identity`, `baseline_own_invoice`,
`negative_cross_account`.

**Hard preconditions:** `/api/meta` must match the frozen contract — exact
revision (`lab-v1-vulnerable`|`lab-v2-patched`), `fixtureVersion: 1.0.0`,
fixture set `alice-bob-invoices`, owner ids invoice_A→user_A/tenant_A,
invoice_B→user_B/tenant_B — AND `whoami` must resolve to `user_A/tenant_A`.
Any failure ⇒ legs marked `inconclusive: <reason>` and the run stops before
the cross-account request — a run under Bob's credential can never read as
Alice's exploit (tested: bob-token, wrong revision, fixtureVersion drift).

## L15 legacy notes



## Ops

```bash
node dist/cli.js check   # docker present? lab network exists+internal?
node dist/cli.js run     # execute one synthetic attempt end to end
node dist/cli.js reap    # janitor: reconcile orphaned managed containers
```

Env config: `HIGHCASTLE_RUNNER_IMAGE`, `HIGHCASTLE_LAB_NETWORK`,
`HIGHCASTLE_LAB_ORIGIN`, `HIGHCASTLE_LAB_IMAGE_DIGEST`,
`HIGHCASTLE_SANDBOX_ALLOW_NONINTERNAL=1` (dev only — never set in prod).

## Verification status (honest)

- **Verified here:** unit suite (46 tests) — arg-profile invariants, policy
  denials, output validation, full lifecycle on a scripted runtime, janitor;
  real pack execution against the real L11 lab (vulnerable→BOLA reproduced,
  patched→denied) via `node src/program/main.ts`; probe honesty
  (unsandboxed run reports breaches + aborts).
- **Not verifiable in this dev env (no Docker daemon):** container-level
  containment. `src/docker.integration.test.ts` (HIGHCASTLE_DOCKER_IT=1) and
  `infra/docker/runner/verify-containment.sh` perform it for real on any
  docker host; L19 repeats it on Vultr.
