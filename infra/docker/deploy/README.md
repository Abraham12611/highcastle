# infra/docker/deploy — HighCastle Compose deployment (L19)

Compose-based deployment for the HighCastle hackathon stack on a Vultr VM
(**Option B** of `docs/architecture/07_VULTR_DEPLOYMENT.md`). Coolify remains
a documented alternative but is intentionally not on the security perimeter —
this Compose topology encodes the containment network contract directly, so
it is the reference deployment.

## Files

| Path | Purpose |
|---|---|
| `compose.yaml` | Full stack: `caddy`, `postgres`, `migrate`, `web`, `worker`, `target-lab` across 4 networks |
| `compose.lab.yaml` | No-secret lab-only stack for local/CI integration testing |
| `Caddyfile` | TLS edge proxy → `web` only; SSE streaming enabled |
| `web.Dockerfile` | Next.js production image via `pnpm deploy` bundle |
| `worker.Dockerfile` | Orchestrator + trusted sandbox controller (ships `docker-cli`) |
| `db-migrate.Dockerfile` | One-shot `packages/db` migrator (needs L02 merged) |
| `*.Dockerfile.dockerignore` | BuildKit per-Dockerfile context ignores (no secrets, no node_modules) |
| `lab-revisions.env` | Canonical vulnerable/patched revision → image mapping for the `target-lab` alias (read by `infra/scripts/lib.sh`) |
| `env-examples/` | Templates for `/etc/highcastle/*.env` and compose `deploy.env` — names only, no values |

## Networks

```
                 public
                   │ 80/443 (+443/udp)
              ┌────┴─────┐
              │  caddy   │  highcastle-edge
              └────┬─────┘
              ┌────┴─────┐        highcastle-control (egress: inference, GitHub OAuth)
              │   web    ├──────────────────┐
              └────┬─────┘                  │
                   │        ┌───────────────┴────┐
                   │        │      worker        │── docker.sock (trusted
                   │        │  orchestrator +    │   controller only)
                   │        │  sandbox controller│
                   │        └─────────┬──────────┘
   highcastle-data │ (internal)       │ creates on host daemon
              ┌────┴──────────────────┤
              │       postgres        │  no published port, no egress
              └───────────────────────┘

   highcastle-runner (external, INTERNAL — no gateway/DNS/egress)
              ┌────────────────┐   ┌─────────────────────┐
              │  target-lab    │◄──│  hc-sb-* runners    │ ephemeral, created
              │  (alias fixed) │   │  per attempt        │ and destroyed by
              └────────────────┘   └─────────────────────┘ the controller
```

## The `target-lab` alias contract

- `packages/contracts` pins `TargetServiceAliasSchema = z.enum(["target-lab"])`,
  so a scan request can name no other host.
- Both compose files attach the lab container to `highcastle-runner` with the
  network alias `target-lab` — the ONLY name Docker's embedded DNS resolves
  on that internal network.
- `TARGET_LAB_IMAGE` selects which built revision serves the alias
  (`lab-v1-vulnerable` for the scan, `lab-v2-patched` for replay). The alias,
  network and runner stay identical across the swap; only the image (and the
  digest recorded via `HIGHCASTLE_TARGET_IMAGE_DIGEST`) changes.
- Users cannot point a scan at an external host: there is no egress and no
  external DNS on `highcastle-runner`, and the contract rejects any alias
  other than `target-lab`.

## L11/L14 integration mismatch — resolution

- **Mismatch:** L11's `apps/target-lab/compose.yaml` network `highcastle-lab`
  is a normal (non-internal) bridge; L14's controller refuses to launch
  unless its `labNetwork` is Docker `internal`.
- **Resolution (deploy-side, zero patches to L11/L14 files):** deployment
  does not reuse `highcastle-lab`. The dedicated external network
  `highcastle-runner` (`internal: true`) is provisioned by
  `infra/scripts/lab-up.sh` / `deploy.sh`, and the same lab image is
  attached to it under `target-lab`. L11's local compose is unchanged.
- **Pending confirmation for code owners (no code change needed):**
  L14 expects the lab on `highcastle-runner` at `http://target-lab:3000`
  (`DEFAULT_LAB_NETWORK`/`DEFAULT_LAB_ORIGIN`) — matched here. `verify-
  containment.sh` dual-homes a lab container onto the same network for
  local verification — compatible.

## Secret delivery

Secrets never enter the repo or runner. On the VM they live in
`/etc/highcastle/` (mode 0700 dir, files 0600), provisioned over SSH:

```bash
sudo install -d -m 0700 /etc/highcastle
# then for each template in env-examples/ → /etc/highcastle/<name>.env
sudo install -m 0600 postgres.env /etc/highcastle/postgres.env
sudo install -m 0600 web.env      /etc/highcastle/web.env
sudo install -m 0600 worker.env   /etc/highcastle/worker.env
sudo install -m 0600 migrate.env  /etc/highcastle/migrate.env
```

`HIGHCASTLE_SECRETS_DIR` (default `/etc/highcastle`) tells compose where to
find them. `target-lab` and sandbox runners get **no** env files — runners
receive a two-key env allowlist from the controller (`HOME`, `NODE_ENV`).

## Bring-up

```bash
infra/scripts/build-images.sh            # lab vuln+patched, runner, web, worker, migrate
infra/scripts/lab-up.sh                  # creates internal net, or:
docker network create --internal highcastle-runner
cd infra/docker/deploy
set -a; . ./deploy.env; set +a           # compose-level vars (see env-examples/)
docker compose -f compose.yaml up -d     # migrate runs to completion first
infra/scripts/health-check.sh
```

Re-run migrations after pulling a release that adds them:
`docker compose -f compose.yaml run --rm migrate`.

## Merge prerequisites (honest status)

`compose.lab.yaml` works on current `develop`. The full `compose.yaml`
build requires these lanes merged: **PR #15** (L14 sandbox — runner image +
`cli.js`), **PR #18** (L02 db — migrate image + `DATABASE_URL` consumers),
**#23** (L16 orchestrator — real worker bindings). Until then `migrate` and
the orchestration parts of `worker` cannot build/run; the smoke suite skips
those checks explicitly.
