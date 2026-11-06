# infra/docker/runner — ephemeral test-pack runner image (L14)

The runner is the **untrusted** half of the sandbox boundary. It is a
single-purpose image containing only the fixed runner program
(`packages/sandbox/src/program`), executed by the **trusted** controller
(`packages/sandbox`, `SandboxController`) under a fully pinned Docker profile.

## Trust model

| Layer | Trusted? | Enforces |
|---|---|---|
| `SandboxController` + `dockerArgs.ts` | yes | every `docker create` flag, image ref, network, env, limits, labels |
| Docker daemon / kernel / internal network | yes | the actual isolation (cgroup, mount ns, net ns, seccomp) |
| Runner program (this image) | no | fixed program; emits NDJSON evidence; probes attempt real forbidden ops |
| Envelope on stdin | no | controller-written only; Zod-validated; opaque credential refs |

The model never reaches any of these layers. The `SandboxRequest` contract has
no field for commands, hosts, flags, mounts or URLs — by construction.

## Container profile (applied by the controller, verified by tests)

- `--user 1000:1000` non-root, `--cap-drop ALL`, `no-new-privileges`, `--init`
- `--read-only` rootfs + one 64MiB `noexec,nosuid,nodev` tmpfs at `/tmp`
- `--pids-limit`, `--memory`/`--memory-swap`, `--cpus` from contract limits
- single network: the **internal** `highcastle-lab` bridge (no outbound route)
- no volumes/mounts, no `docker.sock`, env = `HOME=/tmp` + `NODE_ENV` only
- labels: `highcastle.managed-by`, runner/scan/attempt/workspace ids, deadline

The controller additionally refuses to launch if the lab network is not
`internal` (`docker network inspect`), and kills + removes the container at
the contract deadline, on cancel, and after every outcome — then verifies
removal via `docker inspect`.

## Network topology required

```
control plane (web/worker)   —— never on the lab network
        |
   internal network: highcastle-lab  (docker network create --internal)
        ├── target-lab:3000          (the ONLY reachable service)
        └── hc-sb-<runner>           (ephemeral; created per attempt)
```

An internal network has no gateway/NAT: egress to cloud metadata
(169.254.169.254) or any external host fails at the IP layer — which is
exactly what the runner's egress probe demonstrates and records.

## Build

```bash
pnpm --filter @highcastle/sandbox build
docker build -f infra/docker/runner/Dockerfile -t highcastle/runner:0.1.0 .
```

## End-to-end verification (real, not simulated)

```bash
infra/docker/runner/verify-containment.sh
```

Builds both images, creates the internal network, runs one real attempt via
the controller CLI (`packages/sandbox/dist/cli.js run`), and asserts a
`network.egress_denied` ContainmentEvent plus verified container removal.

The `packages/sandbox` Docker integration suite
(`src/docker.integration.test.ts`, gated on `HIGHCASTLE_DOCKER_IT=1`) exercises
the same boundary through vitest.

## Honest limitations (disclosed, not hidden)

- Docker-on-one-VM is a container boundary, not a microVM. Acceptable for H
  because only a fixed, reviewed test pack ever runs — never arbitrary code.
- Host-level verification (seccomp/AppArmor actually applied, iptables state,
  no shared-kernel escapes) is L19's deployment gate; package code alone is
  not proof of host isolation.
- The dev loopback entries in `ALLOWED_LAB_ORIGINS` exist for uncontainerized
  smoke runs only; production envelopes always use `http://target-lab:3000`,
  and the controller CLI sets it.
