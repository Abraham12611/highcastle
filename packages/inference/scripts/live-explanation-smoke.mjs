/**
 * Live evidence-grounded explanation smoke test (operator-run only).
 *
 * Safety rules (same as live-smoke.mjs):
 * - Performs NO network call unless HIGHCASTLE_RUN_LIVE_SMOKE=1 is set.
 *   Without the flag it prints usage and exits 0 (CI-safe default).
 * - Requires VULTR_INFERENCE_API_KEY + VULTR_INFERENCE_MODEL from the
 *   environment. Never accepts credentials as CLI arguments.
 * - Grounding is mandatory: HIGHCASTLE_EXPLANATION_EVIDENCE_JSON must point
 *   at a real `runBolaPack` result file (attemptId, adjudication, exchange
 *   hashes). The script refuses to run without it — no synthetic IDs.
 * - Prints only safe metadata: model, request ID, latency, token counts,
 *   validation status, rejection code, and the validated explanation prose
 *   (bounded, synthetic-invoice content only). Never prints the key,
 *   prompts, or raw response bodies.
 *
 * Run after a real sandbox run, e.g.:
 *   node /tmp/run-pack.mjs > /tmp/real-run.json
 *   VULTR_INFERENCE_API_KEY="<server-only key>" VULTR_INFERENCE_MODEL="<model id>" \
 *     HIGHCASTLE_RUN_LIVE_SMOKE=1 HIGHCASTLE_EXPLANATION_EVIDENCE_JSON=/tmp/real-run.json \
 *     node scripts/live-explanation-smoke.mjs
 */
import { readFileSync } from "node:fs";
import { ExplanationClient } from "../dist/index.js";
import { VultrInferenceError } from "../dist/errors.js";

function fail(message) {
  console.error(`SMOKE FAILED: ${message}`);
  process.exit(1);
}

if (process.env.HIGHCASTLE_RUN_LIVE_SMOKE !== "1") {
  console.log(
    [
      "LIVE EXPLANATION SMOKE SKIPPED: set HIGHCASTLE_RUN_LIVE_SMOKE=1 with",
      "VULTR_INFERENCE_API_KEY, VULTR_INFERENCE_MODEL and",
      "HIGHCASTLE_EXPLANATION_EVIDENCE_JSON (a real runBolaPack result file)",
      "to perform the real Vultr Serverless Inference call. No network",
      "activity was performed.",
    ].join(" "),
  );
  process.exit(0);
}

const evidencePath = process.env.HIGHCASTLE_EXPLANATION_EVIDENCE_JSON ?? "";
if (evidencePath.length === 0)
  fail("HIGHCASTLE_EXPLANATION_EVIDENCE_JSON is not set; refusing synthetic grounding.");
let run;
try {
  run = JSON.parse(readFileSync(evidencePath, "utf8"));
} catch {
  fail(`cannot read evidence file ${evidencePath}`);
}

const exchanges = Array.isArray(run.exchanges) ? run.exchanges : [];
const findExchange = (path) => exchanges.find((e) => e.path === path) ?? null;
const ownExchange = findExchange("/api/invoices/invoice_A");
const crossExchange = findExchange("/api/invoices/invoice_B");
if (!ownExchange || !crossExchange) fail("evidence file lacks P1/S1 invoice exchanges.");
if (!run.attemptId || !run.adjudication || run.adjudication.preconditionsOk !== true) {
  fail("evidence file lacks a precondition-valid adjudicated attempt.");
}
if (typeof ownExchange.bodyHash !== "string" || ownExchange.bodyHash.length !== 64) {
  fail("P1 exchange lacks a 64-char sha256 bodyHash.");
}
if (typeof crossExchange.bodyHash !== "string" || crossExchange.bodyHash.length !== 64) {
  fail("S1 exchange lacks a 64-char sha256 bodyHash.");
}

const input = {
  attemptId: run.attemptId,
  packId: "bola-invoice-v1",
  packVersion: "1.0.0",
  targetRevision: run.observedRevision ?? run.expectedRevision ?? "lab-v1-vulnerable",
  oracleVerdict: run.adjudication.verdict,
  replayVerdict: null,
  positiveControlPassed:
    run.adjudication.baseline === "pass"
      ? true
      : run.adjudication.baseline === "fail"
        ? false
        : null,
  negativeSecurityConditionMet:
    run.adjudication.securityCheck === "pass"
      ? true
      : run.adjudication.securityCheck === "fail"
        ? false
        : null,
  observationSummaries: run.adjudication.reasons.slice(0, 8),
  evidenceRefs: [
    {
      evidenceId: `exchange-p1-${run.attemptId.slice(0, 8)}`,
      artifactKind: "redacted_response",
      sha256: ownExchange.bodyHash,
      byteSummary: `HTTP ${ownExchange.status} own-invoice read (P1 baseline).`,
    },
    {
      evidenceId: `exchange-s1-${run.attemptId.slice(0, 8)}`,
      artifactKind: "redacted_response",
      sha256: crossExchange.bodyHash,
      byteSummary: `HTTP ${crossExchange.status} cross-account read (S1 security check).`,
    },
  ],
};

const startedAt = Date.now();
try {
  const client = ExplanationClient.fromEnv(process.env);
  console.log(`Config OK: baseUrl=${client.describeForLogging().baseUrl} model=${client.model}`);
  console.log(
    `Grounding: attempt=${input.attemptId} verdict=${input.oracleVerdict} revision=${input.targetRevision}`,
  );
  const result = await client.generateExplanation(input);
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
        responseModel: responseModel ?? "(none)",
        modelSubstituted: substituted,
        requestId: result.metadata.requestId ?? "(none)",
        latencyMs: result.metadata.latencyMs,
        tokensInput: result.metadata.tokensInput,
        tokensOutput: result.metadata.tokensOutput,
        outcome: result.metadata.outcome,
        errorCode: result.metadata.errorCode,
        validationStatus: result.validationStatus,
        rejectionCode: result.rejectionCode,
        issues: result.issues,
        verdictEcho: result.explanation?.verdictEcho ?? null,
        attemptIdEcho: result.explanation?.attemptIdEcho ?? null,
        citedEvidenceIds: result.explanation?.evidenceIds ?? null,
        explanation: result.explanation,
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
