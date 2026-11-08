# HighCastle environment-variable checklist (L19)

Every variable the deployment consumes, where it lives, and who may see it.
**No real values are recorded here or anywhere in the repo.** Secret files
live on the VM at `/etc/highcastle/` (dir `0700`, files `0600`), provisioned
over SSH — never committed, never baked into images, never given to
`target-lab` or sandbox runners.

## 1. Provisioning (operator workstation → vultr-cli)

| Variable | Required | Purpose | Notes |
|---|---|---|---|
| `VULTR_API_KEY` | yes | Authenticates `vultr-cli` (or `~/.vultr-cli.yaml`) | Account-scoped; the $200 credit budget needs a billing alert set in the Vultr console (no API) |
| `ADMIN_SSH_CIDR` | yes | CIDR allowed to tcp/22 in the Vultr firewall group | e.g. your office/exit IP `/32`. Do not use `0.0.0.0/0` |
| `VULTR_SSH_KEY_ID` | one of three | Existing Vultr SSH key id | `vultr-cli ssh-key list` |
| `VULTR_SSH_KEY_NAME` | one of three | Name of an existing key to look up | — |
| `VULTR_SSH_PUBKEY_FILE` | one of three | Local public key uploaded as `highcastle-admin` | Public key only |
| `VULTR_REGION` | no (ewr) | Compute region | Choose nearest to judges/team |
| `VULTR_PLAN` | no (vc2-2c-4gb) | VM size — see resource plan in README | `vc2-4c-8gb` if Playwright runners starve |
| `VULTR_OS_ID` | no (2284) | OS image | 2284 = Ubuntu 24.04 LTS x64 |
| `HIGHCASTLE_DOMAIN` | yes | Public hostname → A/AAAA to VM IP | Also compose-level (Caddy vhost) |

## 2. Compose-level deployment vars (`deploy.env` next to `compose.yaml`, or exported)

| Variable | Required | Purpose |
|---|---|---|
| `HIGHCASTLE_DOMAIN` | yes | Caddy vhost + ACME certificate name |
| `HIGHCASTLE_RELEASE` | no (git short SHA) | Tag for locally built web/worker/migrate images |
| `TARGET_LAB_IMAGE` | no (vulnerable rev) | Image served under the fixed `target-lab` alias; swap to `lab-v2-patched`/digest for replay |
| `HIGHCASTLE_RUNNER_IMAGE` | no (`highcastle/runner:0.1.0`) | Image the trusted controller launches per attempt; pin a digest for the recorded demo |
| `HIGHCASTLE_TARGET_IMAGE_DIGEST` | recommended | Lab image digest written into scan snapshots; refresh after each lab swap |
| `HIGHCASTLE_SECRETS_DIR` | no (`/etc/highcastle`) | Directory holding the four secret env files |

## 3. `/etc/highcastle/postgres.env` → `postgres` service only

| Variable | Purpose |
|---|---|
| `POSTGRES_DB` | Database name (match `DATABASE_URL`) |
| `POSTGRES_USER` | App DB user |
| `POSTGRES_PASSWORD` | Strong random secret (`openssl rand -base64 36`) |

## 4. `/etc/highcastle/web.env` → `web` service only

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | `postgres://<user>:<pass>@postgres:5432/<db>` — host is the compose service name |
| `BETTER_AUTH_SECRET` | Session signing secret |
| `BETTER_AUTH_URL` | Public app URL (https://$HIGHCASTLE_DOMAIN) |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth app |
| `HIGHCASTLE_APP_URL` | Canonical app URL |
| `EVIDENCE_STORAGE_*` | Optional Vultr Object Storage (endpoint/bucket/key/secret); unset = documented local-volume fallback |
| `DEMO_TARGET_BASE_URL` | Display/deep-link only; lab is NOT reachable from `web` |

## 5. `/etc/highcastle/worker.env` → `worker` service only

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Same DSN as web |
| `WORKER_INTERNAL_TOKEN` | Shared secret for internal worker callbacks |
| `VULTR_INFERENCE_API_KEY` | Serverless Inference key — server-only, never a runner |
| `VULTR_INFERENCE_MODEL` | Model ID verified on the live Vultr model list |
| `HIGHCASTLE_TARGET_IMAGE_DIGEST` | Lab digest recorded into scan snapshots |

## 6. `/etc/highcastle/migrate.env` → one-shot `migrate` only

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Only secret the migrator needs |

## 7. Controller/runtime vars (non-secret, set in `compose.yaml`)

| Variable | Purpose |
|---|---|
| `HIGHCASTLE_LAB_NETWORK` | `highcastle-runner` — must be Docker `internal`; controller refuses launch otherwise |
| `HIGHCASTLE_LAB_ORIGIN` | `http://target-lab:3000` — re-allowlisted inside the runner program |
| `WORKER_PORT` | Worker `/healthz` port (3010), never published |

## 8. Runner env — by construction

Sandbox runners receive exactly `HOME=/tmp` and `NODE_ENV=production`
(`RUNNER_ENV` in `packages/sandbox/src/constants.ts`). **Every variable in
sections 3–6 is structurally absent from runner containers** — verified by
`smoke-containment.sh` env-hygiene check plus `docker inspect` during ops.

## Rules

- Real values exist ONLY on the VM under `/etc/highcastle/` (and the operator
  password manager). Generation recipes: `openssl rand -base64 36` for
  passwords/secrets; OAuth values from the GitHub app registration; the
  inference key from the Vultr console.
- If a value leaks into a repo, log, screenshot or video: rotate it, then
  follow `docs/security/01_THREAT_MODEL.md` incident response.
