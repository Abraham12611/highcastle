# HighCastle target-lab (lane L11)

**Owned, deliberately vulnerable, fully synthetic invoice SaaS.** This is the
demonstration target the HighCastle agent tests — it is *not* the HighCastle
application. It contains only fabricated fixtures, no real customer data, no
external credentials, and it makes **no outbound network calls**. Do not deploy
it publicly and do not point it at anything outside an isolated lab network.

- Issue: `highcastle#5` — `[L11 / Early F1] Build isolated synthetic invoice target lab`
- Specs: `docs/agents/02_TEST_PACK_AND_VERIFICATION.md`, `docs/security/02_CONTAINMENT_AND_AUTHORIZATION.md`, `docs/delivery/03_ISSUE_CARDS.md` (L11)

## Revisions

Exactly two build/run revisions, selectable only by an **explicit required
flag** (`--revision=` CLI arg or `TARGET_LAB_REVISION` env) or a **required
Docker build arg** (`LAB_REVISION`). There is no default; a missing or unknown
value exits the process / fails the image build, so the vulnerable variant can
never be started implicitly.

| Revision | Behavior |
|---|---|
| `lab-v1-vulnerable` | `GET /api/invoices/:id` looks the invoice up by id alone — the tenant/ownership predicate is deliberately absent. Any **authenticated** actor can read any invoice (BOLA). |
| `lab-v2-patched` | Invoice lookup is scoped to the actor's tenant (`findByIdForTenant`). Cross-tenant ids return `404 INVOICE_NOT_FOUND`, indistinguishable from a missing object (also prevents id enumeration). |

The single deliberate defect lives in `handleGetInvoice` in
`src/app.ts` — one branch selects the lookup; everything else (auth, envelopes,
errors, fixtures) is identical between revisions.

Revision identity is reported in every response via the
`X-Target-Lab-Revision` header, in every JSON body under `meta.revision`, and
by `GET /health` / `GET /api/meta`. `SOURCE_GIT_SHA` (build arg / env) is echoed
by `/api/meta` when baked at build time; L19 records the immutable image digest
per revision at deployment (the scan snapshot pins it via
`SandboxRequest.targetImageDigest`).

## `target-lab` alias → revision mapping (contract for L14/L15/L19)

`packages/contracts` `TargetServiceAliasSchema` permits **exactly one** value:
`"target-lab"`. Scopes and `SandboxRequest`s never name a hostname or a
per-revision service; the trusted controller/deployment resolves the alias:

```
scope/sandbox contract:  targetServiceAlias = "target-lab"
                         targetImageDigest  = sha256:<pinned per attempt>
                                 │
deployment resolution:   target-lab  →  container on `highcastle-lab` net
                                        running the image behind that digest
```

- **Scan time:** the `target-lab` service runs image
  `highcastle/target-lab:lab-v1-vulnerable` (digest pinned in the scan snapshot).
- **Replay time:** the patched image `highcastle/target-lab:lab-v2-patched` is
  rolled out **under the same `target-lab` alias**; the replay snapshot pins
  the new digest. The oracle must never infer revision from the hostname —
  the ground truth is `GET /health` → `revision` + the pinned image digest.
- Local `compose.yaml` exposes `target-lab` (vulnerable, `127.0.0.1:3030`) and
  `target-lab-patched` (`127.0.0.1:3031`) side by side **for local verification
  only**; `target-lab-patched` is not a scope-legal alias.

## Fixtures (version `1.0.0`, deterministic)

`fixtureVersion` is a strict **SemVer** — it is stored verbatim in
`scans.fixture_version`, which `packages/contracts` `SemVerSchema` validates.
The fixture set itself is named `alice-bob-invoices` (`/api/meta.fixtureSet`).

| Actor | userId | tenantId | Owns | Fixture credential (lab-only) |
|---|---|---|---|---|
| `alice` | `user_A` | `tenant_A` | `invoice_A` (`INV-2026-0001`, $1,299.00) | `lab-token-alice` |
| `bob` | `user_B` | `tenant_B` | `invoice_B` (`INV-2026-0002`, $542.50) | `lab-token-bob` |

Fixture emails use the reserved `.test` TLD. Full invoice payload shape is in
`src/fixtures.ts` and asserted by tests. Fixtures are **read-only** — there is
no HTTP mutation surface; a fresh process always serves identical bytes.

### Synthetic authentication

Two interchangeable lab credentials — both deterministic, both fake:

1. `Authorization: Bearer lab-token-alice` (or `lab-token-bob`)
2. `lab_session=lab-session-<userId>` cookie, issued by
   `POST /api/auth/login {"token": "lab-token-alice"}` — the session id is a
   fixed function of the fixture user, so test traffic is reproducible.

Token values are **trusted lab config** for the test pack (documented here and
in the pack contract); they are never returned by any endpoint, so the
unauthenticated→401 boundary is real even on the vulnerable revision. For the
sandbox contract, `actorCredentialRef` (e.g. `ref:synthetic:alice`) is resolved
by the controller to the corresponding fixture credential — the token string
itself never appears in contracts or events.

## API

All responses are `application/json`; every response carries
`X-Target-Lab-Revision` and `X-Request-Id` headers.

| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/health` | none | `200 {"status":"ok","revision","fixtureVersion","uptimeSeconds"}` |
| GET | `/ready` | none | `200 {"status":"ready","revision","fixtureVersion","fixtures":{"invoices":2,"expected":2}}` (`503` if fixtures not seeded) |
| GET | `/api/meta` | none | `200` service/revision/fixture manifest — ids only, **never** token values |
| POST | `/api/auth/login` | none | `200 {"actor"}` + `Set-Cookie: lab_session=…`; `401` unknown token; `400` malformed body |
| POST | `/api/auth/logout` | any | `200 {"status":"logged_out"}` + expired cookie |
| GET | `/api/auth/whoami` | required | `200 {"actor"}` or `401` |
| GET | `/api/invoices/:id` | required | `200 {"invoice","meta"}` or error envelope |

Error envelope, all revisions: `{"error":{"code","message"},"meta":{"revision","requestId"}}`
with codes `UNAUTHENTICATED` (401), `INVOICE_NOT_FOUND` (404),
`METHOD_NOT_ALLOWED` (405 + `Allow`), `NOT_FOUND` (404 unknown route),
`INVALID_REQUEST` (400), `INTERNAL` (500).

### Expected responses (the whole security property)

Using Alice's credential in both cases:

```
GET /api/invoices/invoice_A   Authorization: Bearer lab-token-alice
→ 200   {"invoice":{"id":"invoice_A","ownerId":"user_A","tenantId":"tenant_A", ...}}
        (identical on both revisions — baseline P1)

GET /api/invoices/invoice_B   Authorization: Bearer lab-token-alice
→ lab-v1-vulnerable: 200 {"invoice":{"id":"invoice_B","ownerId":"user_B","tenantId":"tenant_B",
                        "customer":{"name":"Bob Fixture","email":"bob@targetlab.test"}, ...}}
                        ← BOLA reproduced; oracle checks owner/fields, not status alone
→ lab-v2-patched:     404 {"error":{"code":"INVOICE_NOT_FOUND", ...}}

GET /api/invoices/invoice_B   (no credentials)
→ 401 {"error":{"code":"UNAUTHENTICATED", ...}}            (both revisions)

GET /api/invoices/invoice_XXX  Authorization: Bearer lab-token-alice
→ 404 {"error":{"code":"INVOICE_NOT_FOUND", ...}}          (both revisions)
```

## Run locally (workspace member; Node ≥ 22.18, zero runtime dependencies)

```bash
# from repo root, after `pnpm install`
pnpm --filter @highcastle/target-lab dev            # vulnerable → http://127.0.0.1:3030
pnpm --filter @highcastle/target-lab run start:patched -- --port=3031

# or directly
cd apps/target-lab
node src/server.ts --revision=lab-v1-vulnerable             # → 127.0.0.1:3030
node src/server.ts --revision=lab-v2-patched --port=3031    # → 127.0.0.1:3031
```

**Port note:** the lab's default port is **3030** — `pnpm dev` runs every
workspace `dev` script in parallel and the Next.js web app owns port 3000.
Container images set `PORT=3000` explicitly; that port is internal to the
isolated lab network and is not the host's Next.js port.

Environment equivalents: `TARGET_LAB_REVISION`, `PORT`, `HOST`,
`SOURCE_GIT_SHA`. Default bind is `127.0.0.1` (loopback) — nothing is exposed
off-host unless `HOST` is changed, which Docker does explicitly.

## Checks (CI: `pnpm -r` at root runs these per package)

```bash
pnpm --filter @highcastle/target-lab lint        # eslint flat config
pnpm --filter @highcastle/target-lab typecheck   # tsc --noEmit (strict)
pnpm --filter @highcastle/target-lab test        # vitest run
pnpm --filter @highcastle/target-lab build       # tsc -p tsconfig.build.json → dist/
```

`src/test/` boots the real HTTP listener on an ephemeral port and asserts actual
wire behavior — no mocks:

- `vulnerable.test.ts` — P1 baseline 200; **S1 Alice→`invoice_B` returns 200
  with `ownerId:"user_B"`, `tenantId:"tenant_B"`, Bob's protected fields**
  (the BOLA reproduces); symmetric for Bob; works over cookie session too;
  unauthenticated still 401; invalid token 401; unknown id 404.
- `patched.test.ts` — P1 baseline 200; S1 Alice→`invoice_B` returns
  `404 INVOICE_NOT_FOUND`, shape-identical to a truly missing id; Bob denied
  `invoice_A`; Bob still reads his own.
- `contract.test.ts` — same matrix on **both** revisions: health, readiness,
  meta manifest (asserts no token/session values leak + SemVer
  `fixtureVersion`), envelopes, login/logout/whoami, read-only fixture
  determinism across restarts, absent reset route, 404/405/400 paths.

## Docker

Build context is `apps/target-lab/`; `LAB_REVISION` is a **required** build arg
(build fails without it). Runtime is `node:24-alpine`, non-root `node` user,
`HEALTHCHECK` on `/health`, `EXPOSE 3000`, no secrets, no volumes, no install
step (Node 24 strips types from the shipped `.ts` sources).

```bash
cd apps/target-lab

docker build --build-arg LAB_REVISION=lab-v1-vulnerable \
  --build-arg SOURCE_GIT_SHA=$(git rev-parse HEAD) \
  -t highcastle/target-lab:lab-v1-vulnerable .

docker build --build-arg LAB_REVISION=lab-v2-patched \
  --build-arg SOURCE_GIT_SHA=$(git rev-parse HEAD) \
  -t highcastle/target-lab:lab-v2-patched .

docker run --rm -p 127.0.0.1:3030:3000 highcastle/target-lab:lab-v1-vulnerable
docker run --rm -p 127.0.0.1:3031:3000 highcastle/target-lab:lab-v2-patched
```

Or run both revisions side by side on an isolated network:

```bash
cd apps/target-lab
docker compose up --build -d
# target-lab (vulnerable) → http://127.0.0.1:3030   in-net alias http://target-lab:3000
# target-lab-patched      → http://127.0.0.1:3031   in-net alias http://target-lab-patched:3000
# docker compose down   to stop and remove
```

Compose binds ports to loopback only. For the real deployment (L19), attach the
runner network to `highcastle-lab`, drop the published ports entirely, and roll
the patched image out under the same `target-lab` alias for replay — the lab
must be reachable **only** from the executor network.

## Contract assumptions for other lanes

**For L15 (test-pack / oracle, `bola-invoice-v1`):**

- Scope/sandbox naming: `targetServiceAlias: "target-lab"` only; revision is
  conveyed by `targetImageDigest` in the snapshot, not by the alias.
- Base URLs for local dev: `http://127.0.0.1:3030` (vulnerable) /
  `http://127.0.0.1:3031` (patched); in-net `http://target-lab:3000`.
- Fixture identities: Alice `user_A`/`tenant_A`, Bob `user_B`/`tenant_B`;
  invoices `invoice_A`/`invoice_B`; `fixtureVersion` `1.0.0` (SemVer);
  credentials `lab-token-alice`/`lab-token-bob` behind `actorCredentialRef`.
- P0 revision check: `GET /health` → `revision` field equals the scan-snapshot
  revision and `fixtureVersion` equals `1.0.0`.
- P1 baseline: `GET /api/invoices/invoice_A` with Alice's credential → `200`,
  `invoice.ownerId == "user_A"`.
- S1: same Alice credential, `GET /api/invoices/invoice_B`.
  - `reproduced`: `200` **and** body contains Bob's object —
    `invoice.ownerId == "user_B"`, `invoice.tenantId == "tenant_B"`
    (optionally `customer.name == "Bob Fixture"`, `amountCents == 54250`).
  - `not_reproduced`: `403` or `404` denial (this lab emits `404`).
  - Anything else (5xx, timeout, contract drift, missing baseline) → `inconclusive`.
- Only `GET` is needed for invoices; `POST` exists only for login/logout.
  Pack `permittedMethods: ["GET"]` is satisfied for the security assertion.

**For L03 (contracts):** revision enum `{lab-v1-vulnerable, lab-v2-patched}`;
`fixtureVersion` conforms to `SemVerSchema`; error-code enum listed above;
success envelope `{invoice, meta}`; error envelope
`{error:{code,message}, meta:{revision, requestId}}`; invoice object schema in
`src/fixtures.ts` / `src/types.ts`.

**For L14/L19 (sandbox/deployment):** alias mapping above; the image runs
non-root, needs no env secrets, no volumes, no egress. Record the image digest
per revision at deploy time (required by `SandboxRequest.targetImageDigest`).
The lab listens for HTTP only — terminate TLS upstream if ever exposed beyond
the lab net (it should not be).

## Safety notes

- The vulnerable revision is *intentionally* broken — that is the product
  requirement, not a bug to file. It is still contained: auth is required,
  fixtures are synthetic and read-only, and the process never makes outbound
  requests.
- No real PII, credentials, emails, URLs, or payment data. `.test` emails only.
- No state-mutating HTTP surface beyond login/logout (which only set/clear a
  deterministic cookie) — the runner cannot poison fixtures for other attempts.
- Do not add endpoints that fetch arbitrary URLs or execute input — the lab is
  a fixed, known target by design.
