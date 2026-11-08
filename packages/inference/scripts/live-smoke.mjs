/**
 * Live Vultr Serverless Inference smoke test (operator-run only).
 *
 * Safety rules:
 * - Performs NO network call unless HIGHCASTLE_RUN_LIVE_SMOKE=1 is set.
 *   Without the flag it prints usage and exits 0 (CI-safe default).
 * - Requires VULTR_INFERENCE_API_KEY + VULTR_INFERENCE_MODEL from the
 *   environment. Never accepts credentials as CLI arguments (they would
 *   leak into shell history / CI logs).
 * - Prints only safe metadata: model, request ID, latency, token counts,
 *   validation status, rejection code. Never prints the key, prompts,
 *   or raw model output.
 *
 * Run on a Vultr host with operator credentials:
 *   VULTR_INFERENCE_API_KEY="<key>" VULTR_INFERENCE_MODEL="<model id>" \
 *     HIGHCASTLE_RUN_LIVE_SMOKE=1 pnpm --filter @highcastle/inference smoke
 */
import { VultrInferenceClient } from "../dist/index.js";
import { VultrInferenceError } from "../dist/errors.js";

function safeLabel(value) {
  return typeof value === "string" && value.length > 0 ? value : "(none)";
}

if (process.env.HIGHCASTLE_RUN_LIVE_SMOKE !== "1") {
  console.log(
    [
      "LIVE SMOKE SKIPPED: set HIGHCASTLE_RUN_LIVE_SMOKE=1 with",
      "VULTR_INFERENCE_API_KEY and VULTR_INFERENCE_MODEL to perform the real",
      "Vultr Serverless Inference call. No network activity was performed.",
    ].join(" "),
  );
  process.exit(0);
}

const startedAt = Date.now();
try {
  const client = VultrInferenceClient.fromEnv(process.env);
  console.log(
    `Config OK: baseUrl=${client.describeForLogging().baseUrl} model=${client.model}`,
  );
  const result = await client.generateHypothesis({
    sanitizedSourceContext:
      "GET /api/invoices/:id reads an invoice by id; owner check status unknown.",
    scopeSummary:
      "Owned synthetic lab only; pack bola-invoice-v1; roles alice+bob; max 8 requests.",
    routeSummary: "GET /api/invoices/:id",
    packVersion: "1.0.0",
  });
  const responseModel = result.metadata.responseModel;
  const substituted =
    typeof responseModel === "string" &&
    responseModel.length > 0 &&
    responseModel !== result.metadata.model;
  console.log(
    JSON.stringify(
      {
        provider: result.metadata.provider,
        model: result.metadata.model,
        responseModel: safeLabel(responseModel),
        modelSubstituted: substituted,
        requestId: safeLabel(result.metadata.requestId),
        latencyMs: result.metadata.latencyMs,
        tokensInput: result.metadata.tokensInput,
        tokensOutput: result.metadata.tokensOutput,
        outcome: result.metadata.outcome,
        errorCode: result.metadata.errorCode,
        validationStatus: result.validationStatus,
        rejectionCode: result.rejectionCode,
        issues: result.issues,
        packId: result.proposal?.requestedTest.packId ?? null,
        wallClockMs: Date.now() - startedAt,
      },
      null,
      2,
    ),
  );
  if (substituted) {
    console.error(
      `SMOKE MODEL MISMATCH: requested ${result.metadata.model} but provider reported ${responseModel}.`,
    );
    process.exit(3);
  }
  process.exit(result.validationStatus === "valid" ? 0 : 2);
} catch (error) {
  if (error instanceof VultrInferenceError) {
    console.error(
      `SMOKE FAILED: code=${error.code} outcome=${error.outcome} ` +
        `httpStatus=${error.httpStatus ?? "(none)"} message=${error.message}`,
    );
  } else {
    console.error(`SMOKE FAILED: ${error instanceof Error ? error.message : String(error)}`);
  }
  process.exit(1);
}
