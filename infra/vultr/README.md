# HighCastle on Vultr — infrastructure runbook (L19)

Reproducible deployment of the HighCastle control plane, owned target-lab and
sandbox boundary onto Vultr Cloud Compute. **Status: prepared, not deployed —
no Vultr credentials were used to create resources; every Docker/Vultr check
that could not run locally is listed as PENDING in §10.**

Deployment choice: **Option B — pinned Docker Engine + Docker Compose +
Caddy** on a single Ubuntu 24.04 VM. Coolify (Option A) remains an optional
management UI only; it is deliberately not the security perimeter and adds a
privileged control surface we don't need for the demo. Recorded for the ADR
log: compose encodes the internal-network contract declaratively and is
reproducible from a clean VM in one script.

## 1. Topology

```
                            public internet
                                  │ 80/443(+udp443)
                     ┌────────────┴─────────────┐
                     │ Vultr firewall group      │ tcp22 <- ADMIN_SSH_CIDR only
                     │   (provider edge)         │ tcp/udp 80,443 <- 0.0.0.0/0
                     └────────────┬─────────────┘
                     ┌────────────┴─────────────┐
                     │ UFW (host, same policy)   │
                     └────────────┬─────────────┘
   Vultr VM (vc2-2c-4gb, Ubuntu 24.04, Docker Engine + Compose)
   ┌──────────────────────────────────────────────────────────────┐
   │  network highcastle-edge   ┌────────┐                        │
   │                            │ caddy  │ TLS, ACME, SSE flush    │
   │                            └───┬────┘                        │
   │                                ▼                             │
   │                            ┌────────┐   server-only secrets   │
   │                            │  web   │   (web.env)             │
   │                            └───┬────┘                        │
   │  network highcastle-control    │     ┌──────────────────┐    │
   │  (egress: Vultr inference,     │     │ worker           │    │
   │   GitHub OAuth only)           └────►│ orchestrator +   │────┼──► api.vultrinference.com
   │                                │     │ trusted sandbox  │    │     (the only model path)
   │  network highcastle-data       │     │ controller       │    │
   │  INTERNAL — no egress          │     └───────┬──────────┘    │
   │                          ┌─────┴──────┐      │ docker.sock    │
   │                          │ postgres   │      │ (host daemon)  │
   │                          │  private   │      ▼               │
   │                          └────────────┘   creates hc-sb-*     │
   │                                                            │
   │  network highcastle-runner  INTERNAL — no gateway, no DNS,  │
   │  no egress, no published ports                              │
   │        ┌───────────────┐        ┌───────────────────┐       │
   │        │ target-lab    │◄───────│ hc-sb-* runner    │       │
   │        │ (fixed alias) │ :3000  │ ephemeral, hard-  │       │
   │        └───────────────┘        │ contained, 2-env  │       │
   │                                 └───────────────────┘       │
   └──────────────────────────────────────────────────────────────┘
     Vultr Serverless Inference  ← worker only
     Vultr Object Storage (opt.) ← web/worker evidence, private bucket
```

## 2. Resource plan (bounded)

| Component | Recommendation | Note |
|---|---|---|
| Compute VM | `vc2-2c-4gb` ($20/mo) — headroom: `vc2-4c-8gb` | Runs caddy+web+worker+postgres+lab+one runner. Benchmark one runner first; cap concurrent runners at 1 for the demo (controller `maxPids`/mem/cpu already bounded) |
| OS | `2284` Ubuntu 24.04 LTS | cloud-init bootstrap below |
| Managed Postgres | OPTIONAL — self-hosted `postgres:16.6-alpine` in-stack is the default | Private listener on internal net; managed DB only if it fits credits + private connectivity |
| Serverless Inference | required | worker-only key; model ID from live list |
| Object Storage | optional | private bucket; documented local-volume fallback |
| Budget | $200 credit; set a billing alert in console before provisioning; snapshot VM after working deploy |

## 3. Provision (when credentials arrive)

```bash
export VULTR_API_KEY=...                # or ~/.vultr-cli.yaml already configured
export ADMIN_SSH_CIDR=203.0.113.10/32   # YOUR admin IP — required
export VULTR_SSH_PUBKEY_FILE=~/.ssh/id_ed25519.pub   # or VULTR_SSH_KEY_ID/_NAME
infra/vultr/provision-vm.sh             # creates fw group + VM + prints IP
# optional: VULTR_REGION=lax VULTR_PLAN=vc2-4c-8gb ...
```

The script creates: firewall group `highcastle-edge` (22←admin CIDR;
80/443/443udp←world), one Ubuntu 24.04 instance bootstrapped by
`cloud-init.yaml` (Docker Engine, UFW, sshd hardening, host node+pnpm for
the controller CLI, `/etc/highcastle` 0700, `/opt/highcastle`).

Hand-created instance? `sudo infra/vultr/setup-vm.sh` applies the same
hardening idempotently.

## 4. Deploy

```bash
ssh root@<vm-ip>            # key-only; password auth disabled
git clone <repo-url> /opt/highcastle && cd /opt/highcastle
git checkout <release-ref>

install -d -m 0700 /etc/highcastle
# copy each env-examples/*.env.example to /etc/highcastle/<name>.env,
# fill in values, chmod 0600  (see ENVIRONMENT.md — the checklist)

export HIGHCASTLE_DOMAIN=app.example.com   # A/AAAA -> VM IP first
infra/vultr/deploy.sh                      # builds, migrates, starts, health-checks
infra/scripts/smoke-containment.sh         # full boundary proof
```

`deploy.sh` is idempotent and honest: missing docker, missing/loose secrets
(`!= 0600`), or a non-internal `highcastle-runner` all abort loudly.

## 5. Startup order & migrations

`compose.yaml` dependency graph: `postgres` healthy → `migrate` runs
`packages/db` migrations to `service_completed_successfully` → `web` +
`worker` start → `caddy` proxies. After pulling a release with new
migrations: `docker compose -f infra/docker/deploy/compose.yaml run --rm migrate`.
Migration files are immutable numbered SQL under `packages/db/drizzle/` (L02).

## 6. Health checks

- `infra/scripts/health-check.sh` — compose health, `pg_isready`, lab
  `/health` probed *from inside* the runner network, network still internal,
  overdue orphan runners (janitor surface), public `https://$DOMAIN/healthz`.
- Liveness routes: web `GET /healthz`, worker `GET :3010/healthz`,
  lab `GET /health` + `/ready` (image HEALTHCHECK baked in).
- Docker-level: `no-new-privileges`, `cap_drop: ALL` on every long-running
  service; `read_only` rootfs on caddy/postgres/lab/migrate.
- Inference health is a *worker-side* check (server-only key) — not probed
  by infra scripts; it surfaces via real scan hypothesis events.

## 7. Security invariants (enforced by config, verified by smoke)

- `highcastle-runner` is Docker `internal` → runners + lab have no route and
  no external DNS. `target-lab` is the only DNS name on it.
- `highcastle-data` is `internal` → Postgres cannot egress and is never
  port-published; app traffic arrives over `control`/`edge` nets instead.
- Only `caddy` publishes ports. Postgres/lab/worker publish none.
- `docker.sock` is mounted into `worker` **only** — it IS the trusted
  controller (L16 binds `SandboxController` in-process). Runners get no
  socket, no mounts, 2 env vars.
- Secrets live only in `/etc/highcastle/*.env`, loaded by `env_file` into
  web/worker/postgres/migrate. `deploy.sh` refuses mode ≠ 600/400.
- `smoke-containment.sh` asserts: lab reachable (200), BOLA on vulnerable
  rev (200), metadata+external egress denied with ENFORCEMENT-shaped errors
  (ECONNREFUSED/RESET → inconclusive fail), env hygiene, patched 404 +
  baseline 200, controller event `network.egress_denied`, zero leftover
  runner containers.

## 8. Replay: vulnerable → patched lab swap

```bash
# same alias, same internal network — only the image changes
TARGET_LAB_IMAGE=highcastle/target-lab:lab-v2-patched \
  docker compose -f infra/docker/deploy/compose.yaml up -d target-lab
# then refresh the recorded digest
docker image inspect highcastle/target-lab:lab-v2-patched --format '{{.Id}}'
#   → HIGHCASTLE_TARGET_IMAGE_DIGEST in worker.env + redeploy worker
```

The scan snapshot pins `targetImageDigest` (L16), so a replay is provably
against the patched build — never a moving tag.

## 9. Recovery, restart & incident operations

| Situation | Action |
|---|---|
| VM reboot | All services `restart: unless-stopped`; `highcastle-runner` is a named docker network (survives reboot). Verify: `health-check.sh` |
| Service crash | `docker compose -f compose.yaml up -d` converges; logs: `docker compose logs --since 1h <svc>` (json-file, rotated 10m×3) |
| Deploy broken release | `git checkout <prev-ref> && infra/vultr/deploy.sh`; images tagged by release — rollback is a tag swap; DB migrations are forward-only — snapshot before risky upgrades |
| Postgres data loss | Restore `pgdata` volume from VM snapshot (`vultr-cli snapshot create/restore`) or re-seed synthetic demo fixtures — no real customer data exists |
| Orphaned runners | `docker ps -a --filter label=highcastle.managed-by=l14-sandbox-controller`; reaper: `node packages/sandbox/dist/cli.js reap` (on host or via `docker compose exec worker node node_modules/@highcastle/sandbox/dist/cli.js reap`) |
| Emergency stop | Revoke scope in app; `docker ps -q --filter label=highcastle.managed-by=l14-sandbox-controller | xargs -r docker rm -f`; verify none remain |
| Containment breach / leaked secret | Incident response: `docs/security/01_THREAT_MODEL.md` §Incident — stop jobs, `docker compose down`, isolate VM (detach fw group), rotate every value in `/etc/highcastle`, snapshot for forensics |
| TLS issuance failing | `docker compose logs caddy`; verify A/AAAA + ports reachable; for staging use `localhost` domain |

## 10. PENDING verification (what was NOT run)

This machine has **no Docker daemon** and deployment intentionally ran
without Vultr credentials. Static checks done locally: `bash -n` on all
scripts, Python YAML parse of compose files, shellcheck-style review,
vultr-cli command/flag verification against the live CLI help.

When an operator supplies Docker + Vultr env, run **in order**:

```bash
# local (docker only, no cloud needed)
infra/scripts/build-images.sh
infra/scripts/lab-up.sh
infra/scripts/smoke-containment.sh --strict
# vultr
infra/vultr/provision-vm.sh           # with VULTR_API_KEY + ADMIN_SSH_CIDR + ssh key
infra/vultr/deploy.sh                 # on the VM
infra/scripts/health-check.sh
```

Pending items:

- [ ] `docker compose -f infra/docker/deploy/compose.yaml config` clean
- [ ] all six images build (needs PRs #15 runner, #18 db, #23 worker merged)
- [ ] `smoke-containment.sh --strict` all pass on a Docker host
- [ ] controller `cli.js run` emits `network.egress_denied` on the real net
- [ ] vultr-cli provision + cloud-init reaches `docker info` on the VM
- [ ] ACME cert issuance for the real domain
- [ ] Vultr billing alert set (console — manual)
- [ ] one real end-to-end scan on the VM (post-merge integration)

## 11. File map

| Path | Purpose |
|---|---|
| `provision-vm.sh` | vultr-cli: firewall group + VM + cloud-init, key-only SSH |
| `cloud-init.yaml` | first-boot hardening + Docker + node toolchain |
| `setup-vm.sh` | idempotent equivalent for hand-built instances |
| `deploy.sh` | on-VM build/deploy/health wrapper |
| `ENVIRONMENT.md` | full env checklist — no values |
| `../docker/deploy/` | compose stacks, Caddyfile, image Dockerfiles |
| `../scripts/` | build/lab/smoke/health tooling (also runnable locally) |
