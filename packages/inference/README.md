# @highcastle/inference — Vultr Serverless Inference adapter (L12)

Server-only adapter that turns sanitized invoice-lab context into a
structured security hypothesis validated against the shared
`ModelProposalSchema` (`@highcastle/contracts`). This is the sole agent-LLM
path for the hackathon: every model call uses Vultr Serverless Inference.
There is no fallback to OpenAI, Anthropic, or any other provider — a
non-Vultr endpoint is rejected at config time.

## Environment variables (server-only; never `NEXT_PUBLIC_*`, never committed)

| Variable | Required | Default | Notes |
|---|---|---|---|
| `VULTR_INFERENCE_API_KEY` | yes | — | Server-only secret. Missing key throws `missing_credentials`; no mock is substituted. |
| `VULTR_INFERENCE_MODEL` | yes | — | Model ID chosen from the **live Vultr catalog**. No default is hardcoded (open question Q05). |
| `VULTR_INFERENCE_BASE_URL` | no | `https://api.vultrinference.com/v1` | Any host other than `api.vultrinference.com` throws `non_vultr_endpoint_blocked`. |
| `VULTR_INFERENCE_TIMEOUT_MS` | no | `30000` | Per-attempt timeout, capped at `120000`. |
| `VULTR_INFERENCE_MAX_RETRIES` | no | `2` | Bounded retries for 429/5xx/timeout/network only, capped at `4`. |
| `VULTR_INFERENCE_MAX_TOKENS` | no | `1024` | Output budget, capped at `4096`. |
| `HIGHCASTLE_RUN_LIVE_SMOKE` | smoke only | unset | Must be `1` for `pnpm smoke` to touch the network. |

## Usage (worker/server only)

```ts
import { VultrInferenceClient } from "@highcastle/inference";

const client = VultrInferenceClient.fromEnv(process.env);
const result = await client.generateHypothesis({
  sanitizedSourceContext: "GET /api/invoices/:id reads by id; owner check unknown.",
  scopeSummary: "Owned synthetic lab only; pack bola-invoice-v1; roles alice+bob.",
  routeSummary: "GET /api/invoices/:id",
  packVersion: "1.0.0",
});

if (result.validationStatus === "valid") {
  // result.proposal.requestedTest.packId is always "bola-invoice-v1".
} else {
  // result.rejectionCode + result.issues are auditable; propagate inconclusive.
}
// result.metadata: provider/model/requestId/latencyMs/tokens*/outcome/errorCode,
// plus responseModel (the model the provider envelope actually reported).
// Compare responseModel to model to detect silent substitution: exit 3
// from the smoke script on mismatch.
```

## Real Vultr smoke test (requires operator credentials)

No credentials are configured in this environment, so live verification has
**not** run. When the operator provides a key and model ID on a Vultr host:

```bash
VULTR_INFERENCE_API_KEY="<server-only key>" \
VULTR_INFERENCE_MODEL="<model id from the live Vultr catalog>" \
HIGHCASTLE_RUN_LIVE_SMOKE=1 \
pnpm --filter @highcastle/inference smoke
```

The script makes exactly one bounded hypothesis call against the owned
synthetic invoice context and prints only safe metadata (model, provider-reported responseModel, request ID,
latency, token counts, validation status, rejection code when invalid).
It never prints the key, prompts, or raw bodies, and exits non-zero on any
transport failure. Without `HIGHCASTLE_RUN_LIVE_SMOKE=1` it performs no
network call and exits 0 with usage instructions (CI-safe).

Record the smoke output (model ID, request ID, latency, outcome) in the PR
or scan record as the genuine-Vultr-call evidence. Expected result today:
`validationStatus: valid` with `packId: bola-invoice-v1`, or a documented
`invalid`/error outcome if the live model needs prompt tuning.

## Design notes

- Transport: direct HTTPS `POST {baseUrl}/chat/completions`
  (OpenAI-compatible), `response_format: { type: "json_object" }`,
  `temperature: 0`. No third-party SDK dependency.
- Strict parsing: unknown keys, hallucinated packs, stale versions, and
  shell metacharacters in prose are rejected with auditable codes.
- Retries: only 429 / 5xx / timeout / network errors, with exponential
  backoff (+ `Retry-After` when present). 401/403/404 and invalid model
  output are never retried.
- Test mock: `src/mock.ts` exports `createMockVultrClientForTests`, which
  throws `mock_not_allowed` outside `VITEST` / `NODE_ENV=test` /
  `HIGHCASTLE_INFERENCE_ALLOW_MOCK=1`. It is not re-exported from the
  package root, and `VultrInferenceClient.fromEnv` never returns a mock.

## Open Vultr API uncertainties (report early per assignment)

1. Exact supported model IDs — chosen at runtime from the live catalog (Q05).
2. Whether every catalog model honors `response_format: json_object`
   (Q13); strict server-side parsing is authoritative either way.
3. Exact error-body and `usage` field shapes; the client parses defensively
   and treats envelope deviations as `malformed`, never as success.
4. Live `Retry-After` header behavior; the client honors it when present
   and otherwise uses bounded backoff.
