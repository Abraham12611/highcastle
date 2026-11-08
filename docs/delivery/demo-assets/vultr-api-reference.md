# Vultr API v2 — HighCastle engineer reference

This is a **project-specific index** to the Vultr OpenAPI v2 specification supplied during the Nov 7, 2026 integration review. The full supplied JSON was OpenAPI **3.0.0**, API title **Vultr API**, version **2.0**, with **392 path entries** (2,022,639 bytes, SHA-256 `62b215d2fe7fd825e9738f8b4b06841ca3f2be40299d477095abae9eb9fe2f9b`). The full vendor specification is deliberately **not duplicated in this repo**: it is ~2 MB, spans unrelated product lines, may become stale, and does not belong in the runtime bundle. Use this index and the [official live Vultr API documentation](https://www.vultr.com/api/) for endpoint details.

## Two different APIs — do not confuse them

1. **Vultr account/control-plane API:** `https://api.vultr.com/v2`. Uses `Authorization: Bearer ${VULTR_API_KEY}` and manages instances, firewalls, DNS and Serverless Inference **subscriptions**.
2. **Vultr Serverless Inference model API:** `https://api.vultrinference.com/v1` (as used in HighCastle's verified L12 adapter). Uses a distinct `VULTR_INFERENCE_API_KEY`; the application calls `POST /chat/completions`. This model endpoint is **not described by the attached account-API v2 OpenAPI document**. Do not substitute a control-plane API key for an inference key.

## Exact useful account-API operations from the supplied OpenAPI

| Purpose | HTTP path relative to `/v2` | OpenAPI operationId |
|---|---|---|
| List/create Compute instances | `GET/POST /instances` | `list-instances` / `create-instance` |
| Inspect/update/destroy an instance | `GET/PATCH/DELETE /instances/{instance-id}` | `get-instance` / `update-instance` / `delete-instance` |
| List/create firewall groups | `GET/POST /firewalls` | `list-firewall-groups` / `create-firewall-group` |
| List/add firewall group rules | `GET/POST /firewalls/{firewall-group-id}/rules` | `list-firewall-group-rules` / `post-firewalls-firewall-group-id-rules` |
| List/create DNS records | `GET/POST /domains/{dns-domain}/records` | `list-dns-domain-records` / `create-dns-domain-record` |
| List/create inference subscriptions | `GET/POST /inference` | `list-inference` / `create-inference` |
| Inspect/update/delete subscription | `GET/PATCH/DELETE /inference/{inference-id}` | `get-inference` / `update-inference` / `delete-inference` |
| Query inference usage | `GET /inference/{inference-id}/usage` | `get-inference-usage` |
| Regenerate inference API key | `PATCH /inference/{inference-id}/api-key` | `regenerate-inference-api-key` |

**Security:** Regenerating an inference key is a disruptive credential-rotation action; do not do it just to inspect its configuration. All create/update/delete operations must be intentional and operator-authorized. Never check the keys into Git, issues, screenshots, logs or a browser bundle.

## Request mechanics described by the supplied specification

- Auth: Bearer token, kept on the trusted server or operator's CLI.
- Requests and responses use JSON; follow actual documented required request-body fields instead of copying example IDs.
- List endpoints use cursor-based pagination (`per_page`, `cursor`).
- If requests exceed the documented **30 requests/second/IP** rate limit, HTTP **429** may carry `Retry-After`; honor it.
- A Vultr instance or firewall configuration is **not** an isolation boundary for HighCastle runner execution. Docker's internal lab network, locked-down runner, pinned target image and runtime verification are separate requirements.

## HighCastle ownership

- **L19 / deployment:** `infra/vultr/**`, `infra/docker/deploy/**` — use account API/CLI for VM, DNS and firewall, with minimal operator rights.
- **L12 / inference:** `packages/inference/**` — model calls use the **separate** inference endpoint and `glm-5.3-flash` (live-verified in issue #36). Do not look for `chat/completions` under account API v2.
- **L14 / sandbox, L16 / worker:** These use local trusted Docker/DB APIs; never grant a runner access to either Vultr API credential.
- **Release owners:** Confirm real provider/model request metadata, HTTPS and runtime containment evidence separately; none of these is proven by a healthy VM alone.

**Source provenance:** supplied `openapi.json` attachment in HighCastle review on Nov 7, 2026; source version and digest above. Consult the official live docs for revisions made after that snapshot.
