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
per revision at deployment.

## Fixtures (`lab-fixtures-1.0.0`, deterministic)

| Actor | userId | tenantId | Owns | Fixture credential (lab-only) |
|---|---|---|---|---|
| `alice` | `user_A` | `tenant_A` | `invoice_A` (`INV-2026-0001`, $1,299.00) | `lab-token-alice` |
| `bob` | `user_B` | `tenant_B` | `invoice_B` (`INV-2026-0002`, $542.50) | `lab-token-bob` |

Fixture emails use the reserved `.test` TLD. Full invoice payload shape is in
`src/fixtures.ts` and asserted by tests. `POST /api/fixtures/reset` restores the
canonical seed byte-for-byte; a fresh process is always identical.

### Synthetic authentication

Two interchangeable lab credentials — both deterministic, both fake:

1. `Authorization: Bearer lab-token-alice` (or `lab-token-bob`)
2. `lab_session=lab-session-<userId>` cookie, issued by
   `POST /api/auth/login {"token": "lab-token-alice"}` — the session id is a
   fixed function of the fixture user, so test traffic is reproducible.

Token values are **trusted lab config** for the test pack (documented here and
in the pack contract); they are never returned by any endpoint, so the
unauthenticated→401 boundary is real even on the vulnerable revision.

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
| POST | `/api/fixtures/reset` | none | `200 {"status":"reset","fixtures":{"invoices":2}}` |

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

## Run locally (Node ≥ 22.18, zero runtime dependencies)

```bash
cd apps/target-lab
npm ci                 # dev-only deps: typescript + @types/node

npm run start:vulnerable   # → http://127.0.0.1:3000
npm run start:patched      # same port; run one at a time or override:

node src/server.ts --revision=lab-v1-vulnerable --port=3010 &
node src/server.ts --revision=lab-v2-patched   --port=3020 &
```

Environment equivalents: `TARGET_LAB_REVISION`, `PORT`, `HOST`,
`SOURCE_GIT_SHA`. Default bind is `127.0.0.1` (loopback) — nothing is exposed
off-host unless `HOST` is changed, which Docker does explicitly.

## Tests

```bash
cd apps/target-lab
npm ci
npm run check          # = tsc --noEmit (strict) + node --test
```

`test/` boots the real HTTP listener on an ephemeral port and asserts actual
wire behavior — no mocks:

- `vulnerable.test.ts` — P1 baseline 200; **S1 Alice→`invoice_B` returns 200
  with `ownerId:"user_B"`, `tenantId:"tenant_B"`, Bob's protected fields**
  (the BOLA reproduces); symmetric for Bob; works over cookie session too;
  unauthenticated still 401; unknown id 404.
- `patched.test.ts` — P1 baseline 200; S1 Alice→`invoice_B` returns
  `404 INVOICE_NOT_FOUND`, byte-shape identical to a truly missing id; Bob
  denied `invoice_A`; Bob still reads his own.
- `contract.test.ts` — runs the same matrix on **both** revisions: health,
  readiness, meta manifest (asserts no token/session values leak), envelopes,
  login/logout/whoami, reset, determinism across restart, 404/405/400 paths.

## Docker

Build context is `apps/target-lab/`; `LAB_REVISION` is a **required** build arg
(build fails without it). Runtime is `node:24-alpine`, non-root `node` user,
`HEALTHCHECK` on `/health`, `EXPOSE 3000`, no secrets, no host mounts.

```bash
cd apps/target-lab

docker build --build-arg LAB_REVISION=lab-v1-vulnerable \
  --build-arg SOURCE_GIT_SHA=$(git rev-parse HEAD) \
  -t highcastle/target-lab:lab-v1-vulnerable .

docker build --build-arg LAB_REVISION=lab-v2-patched \
  --build-arg SOURCE_GIT_SHA=$(git rev-parse HEAD) \
  -t highcastle/target-lab:lab-v2-patched .

docker run --rm -p 127.0.0.1:3010:3000 highcastle/target-lab:lab-v1-vulnerable
docker run --rm -p 127.0.0.1:3020:3000 highcastle/target-lab:lab-v2-patched
```

Or run both revisions side by side on an isolated network:

```bash
cd apps/target-lab
docker compose up --build -d
# vulnerable → http://127.0.0.1:3010   in-net alias http://target-lab-vulnerable:3000
# patched    → http://127.0.0.1:3020   in-net alias http://target-lab-patched:3000
# docker compose down   to stop and remove
```

Compose binds ports to loopback only. For the real deployment (L19), attach the
runner network to `highcastle-lab` and drop the published ports entirely —
the lab must be reachable **only** from the executor network.

## Contract assumptions for other lanes

**For L15 (test-pack / oracle), pack `bola-invoice-v1`:**

- Base URLs: `http://target-lab-vulnerable:3000` and
  `http://target-lab-patched:3000` on the `highcastle-lab` network
  (loopback `127.0.0.1:3010`/`:3020` when run via `compose.yaml`).
- Fixture identities: Alice `user_A`/`tenant_A`, Bob `user_B`/`tenant_B`;
  invoices `invoice_A`/`invoice_B`; credentials `lab-token-alice`/`lab-token-bob`.
- P0 revision check: `GET /health` → `revision` field equals the scan-snapshot
  revision; `fixtureVersion` equals `lab-fixtures-1.0.0`.
- P1 baseline: `GET /api/invoices/invoice_A` with Alice's credential → `200`,
  `invoice.ownerId == "user_A"`.
- S1: same Alice credential, `GET /api/invoices/invoice_B`.
  - `reproduced`: `200` **and** body contains Bob's object —
    `invoice.ownerId == "user_B"`, `invoice.tenantId == "tenant_B"`
    (optionally `customer.name == "Bob Fixture"`, `amountCents == 54250`).
  - `not_reproduced`: `403` or `404` denial (this lab emits `404`).
  - Anything else (5xx, timeout, contract drift, missing baseline) → `inconclusive`.
- Only `GET` is needed for invoices; `POST` exists only for login/logout/reset.
  Pack `permittedMethods: ["GET"]` is satisfied for the security assertion.

**For L03 (contracts):** revision enum `{lab-v1-vulnerable, lab-v2-patched}`;
error-code enum listed above; success envelope `{invoice, meta}`; error
envelope `{error:{code,message}, meta:{revision, requestId}}`; invoice object
schema in `src/fixtures.ts` / `src/types.ts`. If `packages/contracts` later
publishes a `TargetLabFixture` type, this package can adopt it — the shapes are
intentionally stable.

**For L14/L19 (sandbox/deployment):** service aliases and network above; the
image runs non-root, needs no env secrets, no volumes, no egress. Record the
image digest per revision at deploy time (spec requirement for attempt
evidence). The lab listens for HTTP only — terminate TLS upstream if ever
exposed beyond the lab net (it should not be).

## Integration notes (L01 bootstrap is in-flight)

The committed `develop` head (9dc72d1) is docs-only; the L01 pnpm-workspace
bootstrap exists in-flight but is not yet merged. This package is therefore
**self-contained on purpose**: own `package.json` + `package-lock.json`
(dev-only deps `typescript`, `@types/node`), plain `node`/`npm` commands, no
imports of root config. It already conforms to the workspace layout so the
merge is mechanical:

- Package name/location match the workspace glob (`apps/*`,
  `@highcastle/target-lab`) and the standard script names exist
  (`dev`, `build`, `test`, `typecheck`); `build` is a truthful no-op because
  Node runs `.ts` via type-stripping — there is no compile step.
- devDep versions mirror the planned catalog (`typescript` 5.9.3,
  `@types/node` 24.x). After L01 merges, swap them for `"catalog:"` refs,
  delete `package-lock.json`, and let pnpm own the lockfile (root-owned, L01).
- `tsconfig.json` is standalone for now; it mirrors `tsconfig.base.json`
  strictness and can switch to `extends: "../../tsconfig.base.json"` once that
  file is committed (keeping `module`/`moduleResolution: NodeNext`,
  `allowImportingTsExtensions`, `erasableSyntaxOnly`, `noEmit`, `types: ["node"]`).
- Tests use the built-in `node:test` runner (zero deps, real HTTP against the
  listener on an ephemeral port). Migrating to the workspace vitest pin later
  is optional — assertions are plain `node:assert` either way. `lint` is
  intentionally absent until the shared eslint config lands (L01); honest gap.
- Root-level compose/deploy wiring belongs to L19; `compose.yaml` here is
  local-only. No GitHub Action exists yet — `npm run check` is the CI-ready
  command.
- `SOURCE_GIT_SHA` is optional provenance for `/api/meta`; L19 should inject it
  at image build and record the immutable image digest per revision.

## Safety notes

- The vulnerable revision is *intentionally* broken — that is the product
  requirement, not a bug to file. It is still contained: auth is required,
  fixtures are synthetic, and the process never makes outbound requests.
- No real PII, credentials, emails, URLs, or payment data. `.test` emails only.
- Do not add endpoints that fetch arbitrary URLs or execute input — the lab is
  a fixed, known target by design.
