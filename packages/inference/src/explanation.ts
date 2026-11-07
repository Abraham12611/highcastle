import { z } from "zod";
import {
  OracleVerdictSchema,
  ReplayVerdictSchema,
  type ModelCallOutcome,
  type OracleVerdict,
  type ReplayVerdict,
} from "@highcastle/contracts";
import {
  describeConfigForLogging,
  resolveVultrConfig,
  type ResolvedVultrConfig,
} from "./config.js";
import { VultrInferenceError, type InferenceErrorCode } from "./errors.js";
import { redactForStorage } from "./validate.js";

/**
 * Evidence-grounded post-execution explanation (Engineer 8, issue #55).
 *
 * Runs AFTER the independent oracle verdict is persisted. The model
 * receives ONLY redacted, bounded, trusted observations: the oracle
 * verdict, short observation summaries, and approved evidence IDs with
 * digests — never provider keys, DB credentials, raw protected response
 * bodies, arbitrary URLs, or untrusted tool instructions. The explanation
 * is advisory prose: it cannot create, change, or override security
 * verdicts. The caller's persisted oracle verdict is echoed back through
 * the strict output schema and any deviation is rejected.
 *
 * This module is self-contained on purpose: it reuses only the shared
 * config/error/redaction plumbing (read-only imports) and never touches
 * Engineer 7's prompt/program files. Worker wiring belongs to Engineer 1.
 */

/** The only pack this explanation stage may describe. */
export const EXPLANATION_PACK_ID = "bola-invoice-v1" as const;

export const EXPLANATION_VERSION = 1 as const;

/** Bounds keep every model input small, auditable, and log-safe. */
export const MAX_OBSERVATION_SUMMARIES = 8;
export const MAX_OBSERVATION_CHARS = 500;
export const MAX_EVIDENCE_REFS = 8;
export const MAX_EVIDENCE_SUMMARY_CHARS = 280;

/** One approved evidence reference: identity + digest, never the body. */
export const EvidenceRefSchema = z
  .object({
    evidenceId: z.string().min(1).max(128),
    artifactKind: z.string().min(1).max(64),
    sha256: z.string().length(64),
    byteSummary: z.string().min(1).max(MAX_EVIDENCE_SUMMARY_CHARS),
  })
  .strict();
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;

/** Trusted oracle data the explanation may cite. Raw bodies are not fields. */
export const ExplanationPromptInputSchema = z
  .object({
    attemptId: z.string().min(1).max(128),
    packId: z.literal(EXPLANATION_PACK_ID),
    packVersion: z.string().min(1).max(32),
    targetRevision: z.string().min(1).max(128),
    oracleVerdict: OracleVerdictSchema,
    /** Server-persisted replay verdict, when this explains a patched replay. */
    replayVerdict: ReplayVerdictSchema.nullable(),
    positiveControlPassed: z.boolean().nullable(),
    negativeSecurityConditionMet: z.boolean().nullable(),
    observationSummaries: z
      .array(z.string().min(1).max(MAX_OBSERVATION_CHARS))
      .min(1)
      .max(MAX_OBSERVATION_SUMMARIES),
    evidenceRefs: z.array(EvidenceRefSchema).min(1).max(MAX_EVIDENCE_REFS),
  })
  .strict();
export type ExplanationPromptInput = z.infer<typeof ExplanationPromptInputSchema>;

/** Plain prose only — no shell syntax, same rule as the hypothesis stage. */
const plainProse = (min: number, max: number) =>
  z
    .string()
    .min(min)
    .max(max)
    .refine((value) => !/[`$\\]/.test(value), {
      message: "Explanation prose must be plain text, not shell syntax",
    });

/**
 * The ONLY shape accepted from model output. Strict: unknown keys,
 * verdict overrides, and citations of unapproved evidence IDs are
 * rejections, not repairs.
 */
export const ModelExplanationSchema = z
  .object({
    explanationVersion: z.literal(EXPLANATION_VERSION),
    summary: plainProse(1, 500),
    whatHappened: plainProse(1, 1000),
    whyVerdict: plainProse(1, 1000),
    replayMeaning: plainProse(1, 1000).nullable(),
    /** MUST equal the caller-supplied oracle verdict — enforced in code. */
    verdictEcho: OracleVerdictSchema,
    /** MUST equal the caller-supplied attempt ID — enforced in code. */
    attemptIdEcho: z.string().min(1).max(128),
    /** MUST be a non-empty subset of the approved evidence IDs. */
    evidenceIds: z.array(z.string().min(1).max(128)).min(1).max(MAX_EVIDENCE_REFS),
    followUp: plainProse(1, 280).nullable(),
  })
  .strict();
export type ModelExplanation = z.infer<typeof ModelExplanationSchema>;

export const EXPLANATION_REJECTION_CODES = [
  "empty_explanation",
  "schema_mismatch",
  "verdict_override",
  "id_mismatch",
  "unknown_evidence_ref",
  "model_substituted",
  "transport_error",
] as const;
export type ExplanationRejectionCode = (typeof EXPLANATION_REJECTION_CODES)[number];

/**
 * Every validation rejection maps to a contract `ModelCallOutcome` so the
 * orchestrator can record the call in durable storage: malformed output is
 * `malformed`; model attempts to override verdicts, swap IDs, or cite
 * unapproved evidence are `policy_conflict`; transport failures keep the
 * provider's own code.
 */
function outcomeForRejection(rejection: ExplanationRejectionCode): {
  outcome: ModelCallOutcome;
  errorCode: InferenceErrorCode | "model_substituted";
} {
  switch (rejection) {
    case "schema_mismatch":
    case "empty_explanation":
      return { outcome: "malformed", errorCode: "malformed" };
    case "verdict_override":
    case "id_mismatch":
    case "unknown_evidence_ref":
      return { outcome: "policy_conflict", errorCode: "policy_conflict" };
    case "model_substituted":
      return { outcome: "error", errorCode: "model_substituted" };
    case "transport_error":
      return { outcome: "error", errorCode: "provider_error" };
  }
}

export type ExplanationParseResult =
  | { status: "valid"; explanation: ModelExplanation }
  | {
      status: "invalid";
      rejectionCode: ExplanationRejectionCode;
      issues: string[];
    };

export interface ExplanationCallMetadata {
  provider: "vultr";
  /** Model requested by the operator (env-selected). */
  model: string;
  /**
   * Model actually reported by the provider envelope. A mismatch means
   * silent substitution: the result is rejected, never stored as genuine.
   */
  responseModel: string | null;
  requestId: string | null;
  latencyMs: number;
  tokensInput: number | null;
  tokensOutput: number | null;
  outcome: ModelCallOutcome;
  errorCode: InferenceErrorCode | "model_substituted" | null;
}

export interface ExplanationResult {
  /** Validated explanation, or null when validation/transport failed. */
  explanation: ModelExplanation | null;
  validationStatus: "valid" | "invalid";
  rejectionCode: ExplanationRejectionCode | null;
  issues: string[];
  /** Sanitized model payload for safe storage — never raw secrets. */
  rawExplanationRedacted: unknown;
  metadata: ExplanationCallMetadata;
}

export interface ExplanationDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/** Extract embedded JSON, tolerating ```json fences around the object. */
function extractJsonPayload(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length === 0) return trimmed;
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence?.[1] !== undefined) return fence[1].trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) return trimmed.slice(first, last + 1);
  return trimmed;
}

/**
 * Build the chat messages for the explanation call. The verdicts are
 * stated as GIVEN facts the model must echo, never decide; only the
 * approved evidence IDs may be cited.
 */
export function buildExplanationMessages(input: ExplanationPromptInput): Array<{
  role: "system" | "user";
  content: string;
}> {
  const evidenceLines = input.evidenceRefs
    .map(
      (ref) => `- ${ref.evidenceId} [${ref.artifactKind} sha256:${ref.sha256}]: ${ref.byteSummary}`,
    )
    .join("\n");
  const observations = input.observationSummaries
    .map((summary, index) => `${index + 1}. ${summary}`)
    .join("\n");
  const replayLine =
    input.replayVerdict === null
      ? "Replay verdict: none (this explains the original attempt)."
      : `Replay verdict (server-persisted, GIVEN): ${input.replayVerdict}.`;
  const skeleton = JSON.stringify({
    explanationVersion: EXPLANATION_VERSION,
    summary: "one or two sentences on the finding",
    whatHappened: "what the trusted observations show",
    whyVerdict: "why the GIVEN oracle verdict follows",
    replayMeaning: null,
    verdictEcho: input.oracleVerdict,
    attemptIdEcho: input.attemptId,
    evidenceIds: input.evidenceRefs.map((ref) => ref.evidenceId),
    followUp: null,
  });
  return [
    {
      role: "system",
      content: [
        "You explain an already-decided application-security test result.",
        "The oracle verdicts below are FINAL and decided by deterministic code, not by you.",
        "Rules: echo the given verdicts exactly; cite ONLY the evidence IDs listed;",
        "never invent verdicts, IDs, digests, URLs, credentials, or commands;",
        "plain prose only. Reply with a single JSON object matching the required shape.",
      ].join(" "),
    },
    {
      role: "user",
      content: [
        `Attempt ${input.attemptId} ran pack ${input.packId} v${input.packVersion}`,
        `against target revision ${input.targetRevision}.`,
        `Oracle verdict (GIVEN, echo exactly): ${input.oracleVerdict}.`,
        replayLine,
        `Positive control (legitimate read) passed: ${String(input.positiveControlPassed)}.`,
        `Negative condition (cross-account read blocked) met: ${String(input.negativeSecurityConditionMet)}.`,
        "Trusted observation summaries:",
        observations,
        "Approved evidence (cite IDs from this list only):",
        evidenceLines,
        "Explain what happened, why the given verdict follows, and what the",
        "replay verdict (if any) demonstrates. Do not restate raw bodies.",
        "Reply with ONLY the JSON object below, with its exact keys and your",
        "prose filled in (use null only for replayMeaning/followUp when there",
        "is nothing to say):",
        skeleton,
      ].join("\n"),
    },
  ];
}

/**
 * Parse one raw model content string into a validated explanation,
 * grounded against the trusted input. Never throws for malformed input —
 * failures become rejection codes the orchestrator can audit.
 */
export function parseModelExplanation(
  content: string,
  input: ExplanationPromptInput,
): ExplanationParseResult {
  if (content.trim().length === 0) {
    return {
      status: "invalid",
      rejectionCode: "empty_explanation",
      issues: ["Model returned empty content."],
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonPayload(content)) as unknown;
  } catch {
    return {
      status: "invalid",
      rejectionCode: "schema_mismatch",
      issues: ["Model content is not valid JSON."],
    };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      status: "invalid",
      rejectionCode: "schema_mismatch",
      issues: ["Model JSON is not an object."],
    };
  }
  const result = ModelExplanationSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
    );
    return { status: "invalid", rejectionCode: "schema_mismatch", issues };
  }
  const explanation = result.data;
  if (explanation.verdictEcho !== input.oracleVerdict) {
    return {
      status: "invalid",
      rejectionCode: "verdict_override",
      issues: [
        `Model echoed verdict "${explanation.verdictEcho}" but the persisted oracle verdict is "${input.oracleVerdict}". The model cannot override verdicts.`,
      ],
    };
  }
  if (explanation.attemptIdEcho !== input.attemptId) {
    return {
      status: "invalid",
      rejectionCode: "id_mismatch",
      issues: [
        `Model cited attempt "${explanation.attemptIdEcho}" but the explained attempt is "${input.attemptId}".`,
      ],
    };
  }
  const approved = new Set(input.evidenceRefs.map((ref) => ref.evidenceId));
  const unknown = explanation.evidenceIds.filter((id) => !approved.has(id));
  if (unknown.length > 0) {
    return {
      status: "invalid",
      rejectionCode: "unknown_evidence_ref",
      issues: [
        `Model cited unapproved evidence IDs: ${unknown.join(", ")}. Only the approved list may be cited.`,
      ],
    };
  }
  return { status: "valid", explanation };
}

/** Minimal defensive shape for an OpenAI-compatible chat completion. */
const ChatCompletionResponseSchema = z
  .object({
    id: z.string().optional(),
    model: z.string().optional(),
    choices: z
      .array(
        z.object({
          message: z.object({ content: z.string().nullable().optional() }).passthrough(),
        }),
      )
      .min(1),
    usage: z
      .object({
        prompt_tokens: z.number().optional(),
        completion_tokens: z.number().optional(),
        total_tokens: z.number().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const RETRY_AFTER_CAP_MS = 30_000;
const BACKOFF_BASE_MS = 500;
const BACKOFF_CAP_MS = 8_000;

function backoffMs(attempt: number): number {
  const grown = BACKOFF_BASE_MS * 2 ** attempt;
  return Math.min(grown, BACKOFF_CAP_MS) + Math.floor(Math.random() * 200);
}

function parseRetryAfterMs(value: string | null): number | null {
  if (value === null || value.trim().length === 0) return null;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, RETRY_AFTER_CAP_MS);
  }
  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, Math.min(dateMs - Date.now(), RETRY_AFTER_CAP_MS));
  }
  return null;
}

/**
 * Map an HTTP failure to a typed error using ONLY the numeric status —
 * never the raw provider body, which may contain secret-shaped material
 * that must not reach logs or error messages.
 */
function errorCodeForStatus(status: number): {
  code: InferenceErrorCode;
  message: string;
} {
  if (status === 429) {
    return {
      code: "rate_limited",
      message: "Vultr inference rate limit hit (HTTP 429). Backing off before retry.",
    };
  }
  if (status === 404) {
    return {
      code: "unavailable_model",
      message:
        "Vultr inference endpoint reported not found (HTTP 404). Select a model ID from the live Vultr catalog.",
    };
  }
  if (status === 401 || status === 403) {
    return {
      code: "provider_error",
      message: `Vultr rejected the request credentials (HTTP ${status}). Check VULTR_INFERENCE_API_KEY; the key itself is never logged.`,
    };
  }
  if (status >= 500) {
    return {
      code: "provider_error",
      message: `Vultr inference server error (HTTP ${status}).`,
    };
  }
  return {
    code: "provider_error",
    message: `Vultr inference request failed (HTTP ${status}).`,
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

function safePreview(text: string): string {
  return text.length > 2000 ? `${text.slice(0, 2000)}…` : text;
}

function extractResponseModel(parsed: unknown): string | null {
  if (typeof parsed === "object" && parsed !== null) {
    const model = (parsed as Record<string, unknown>)["model"];
    return typeof model === "string" && model.length > 0 ? model : null;
  }
  return null;
}

export class ExplanationClient {
  private readonly config: ResolvedVultrConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(config: ResolvedVultrConfig, deps?: ExplanationDeps) {
    this.config = config;
    this.fetchImpl = deps?.fetchImpl ?? globalThis.fetch;
    this.sleep = deps?.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = deps?.now ?? Date.now;
  }

  /** Build a real client from server environment. Never returns a mock. */
  static fromEnv(env: NodeJS.ProcessEnv = process.env, deps?: ExplanationDeps): ExplanationClient {
    return new ExplanationClient(resolveVultrConfig(env), deps);
  }

  /** Safe config summary for logs/telemetry — never includes the key. */
  describeForLogging(): ReturnType<typeof describeConfigForLogging> {
    return describeConfigForLogging(this.config);
  }

  get model(): string {
    return this.config.model;
  }

  /**
   * Generate an evidence-grounded explanation. Fail-closed: invalid input
   * (no evidence, unbounded fields) throws before any network call; every
   * transport or validation failure returns an `invalid` result with full
   * metadata so the orchestrator can record it and keep the independent
   * verdict unchanged.
   */
  async generateExplanation(rawInput: unknown): Promise<ExplanationResult> {
    const parsedInput = ExplanationPromptInputSchema.safeParse(rawInput);
    if (!parsedInput.success) {
      const issues = parsedInput.error.issues.map(
        (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
      );
      return {
        explanation: null,
        validationStatus: "invalid",
        rejectionCode: "schema_mismatch",
        issues: [
          "Explanation input failed trusted-input validation; no model call was made.",
          ...issues,
        ],
        rawExplanationRedacted: redactForStorage(rawInput),
        metadata: {
          provider: "vultr",
          model: this.config.model,
          responseModel: null,
          requestId: null,
          latencyMs: 0,
          tokensInput: null,
          tokensOutput: null,
          outcome: "error",
          errorCode: "invalid_config",
        },
      };
    }
    const input = parsedInput.data;
    const messages = buildExplanationMessages(input);
    const requestBody = JSON.stringify({
      model: this.config.model,
      messages,
      response_format: { type: "json_object" },
      max_tokens: this.config.maxTokens,
      temperature: 0,
    });

    let attempt = 0;
    for (;;) {
      const startedAt = this.now();
      try {
        const response = await this.postCompletions(requestBody);
        const latencyMs = this.now() - startedAt;
        if (!response.ok) {
          await response.text().catch(() => "");
          const retryAfterMs = response.headers
            ? parseRetryAfterMs(response.headers.get("retry-after"))
            : null;
          const mapped = errorCodeForStatus(response.status);
          if (
            (mapped.code === "rate_limited" || mapped.code === "provider_error") &&
            attempt < this.config.maxRetries
          ) {
            await this.sleep(retryAfterMs ?? backoffMs(attempt));
            attempt += 1;
            continue;
          }
          throw new VultrInferenceError(mapped.code, mapped.message, {
            httpStatus: response.status,
            retryAfterMs,
          });
        }
        return this.toResult(await response.text(), response, latencyMs, input);
      } catch (error) {
        if (error instanceof VultrInferenceError) {
          if (
            error.retryable &&
            error.code !== "rate_limited" &&
            attempt < this.config.maxRetries
          ) {
            await this.sleep(backoffMs(attempt));
            attempt += 1;
            continue;
          }
          return this.transportResult(error, this.now() - startedAt);
        }
        if (isAbortError(error)) {
          const timeout = new VultrInferenceError(
            "timeout",
            `Vultr inference call timed out after ${this.config.timeoutMs}ms.`,
          );
          if (attempt < this.config.maxRetries) {
            await this.sleep(backoffMs(attempt));
            attempt += 1;
            continue;
          }
          return this.transportResult(timeout, this.now() - startedAt);
        }
        const network = new VultrInferenceError(
          "provider_error",
          "Vultr inference network failure.",
        );
        if (attempt < this.config.maxRetries) {
          await this.sleep(backoffMs(attempt));
          attempt += 1;
          continue;
        }
        return this.transportResult(network, this.now() - startedAt);
      }
    }
  }

  private async postCompletions(body: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      return await this.fetchImpl(`${this.config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.config.apiKey}`,
        },
        body,
        signal: controller.signal,
        // Never follow redirects with a credential-bearing request.
        redirect: "error",
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private toResult(
    bodyText: string,
    response: Response,
    latencyMs: number,
    input: ExplanationPromptInput,
  ): ExplanationResult {
    let parsed: unknown = null;
    let envelopeIssue: string | null = null;
    try {
      parsed = JSON.parse(bodyText) as unknown;
    } catch {
      envelopeIssue = "Provider returned a non-JSON envelope.";
    }
    const envelope = envelopeIssue === null ? ChatCompletionResponseSchema.safeParse(parsed) : null;
    if (envelope === null || !envelope.success) {
      return this.invalidResult(
        "schema_mismatch",
        [envelopeIssue ?? "Provider envelope did not match chat completion shape."],
        redactForStorage(safePreview(bodyText)),
        response.headers.get("x-request-id"),
        latencyMs,
        null,
        null,
        extractResponseModel(parsed),
      );
    }
    const content = envelope.data.choices[0]?.message.content ?? null;
    const requestId = envelope.data.id ?? response.headers.get("x-request-id");
    const responseModel = envelope.data.model ?? null;
    const tokensInput = envelope.data.usage?.prompt_tokens ?? null;
    const tokensOutput = envelope.data.usage?.completion_tokens ?? null;
    if (typeof content !== "string" || content.trim().length === 0) {
      return this.invalidResult(
        "empty_explanation",
        ["Provider returned empty message content."],
        redactForStorage(safePreview(bodyText)),
        requestId,
        latencyMs,
        tokensInput,
        tokensOutput,
        responseModel,
      );
    }
    // Silent substitution check BEFORE parsing: a response from a
    // different model than requested is rejected, never stored as genuine.
    if (
      typeof responseModel === "string" &&
      responseModel.length > 0 &&
      responseModel !== this.config.model
    ) {
      return {
        explanation: null,
        validationStatus: "invalid",
        rejectionCode: "model_substituted",
        issues: [
          `Provider reported model "${responseModel}" but "${this.config.model}" was requested. Possible silent substitution; explanation rejected.`,
        ],
        rawExplanationRedacted: redactForStorage(safePreview(content)),
        metadata: {
          provider: "vultr",
          model: this.config.model,
          responseModel,
          requestId,
          latencyMs,
          tokensInput,
          tokensOutput,
          outcome: "error",
          errorCode: "model_substituted",
        },
      };
    }
    const parsedExplanation = parseModelExplanation(content, input);
    if (parsedExplanation.status === "invalid") {
      return this.invalidResult(
        parsedExplanation.rejectionCode,
        parsedExplanation.issues,
        redactForStorage(safePreview(content)),
        requestId,
        latencyMs,
        tokensInput,
        tokensOutput,
        responseModel,
      );
    }
    return {
      explanation: parsedExplanation.explanation,
      validationStatus: "valid",
      rejectionCode: null,
      issues: [],
      rawExplanationRedacted: redactForStorage(parsedExplanation.explanation),
      metadata: {
        provider: "vultr",
        model: this.config.model,
        responseModel,
        requestId,
        latencyMs,
        tokensInput,
        tokensOutput,
        outcome: "success",
        errorCode: null,
      },
    };
  }

  private invalidResult(
    rejectionCode: ExplanationRejectionCode,
    issues: string[],
    redacted: unknown,
    requestId: string | null,
    latencyMs: number,
    tokensInput: number | null,
    tokensOutput: number | null,
    responseModel: string | null,
  ): ExplanationResult {
    const mapped = outcomeForRejection(rejectionCode);
    return {
      explanation: null,
      validationStatus: "invalid",
      rejectionCode,
      issues,
      rawExplanationRedacted: redacted,
      metadata: {
        provider: "vultr",
        model: this.config.model,
        responseModel,
        requestId,
        latencyMs,
        tokensInput,
        tokensOutput,
        outcome: mapped.outcome,
        errorCode: mapped.errorCode,
      },
    };
  }

  private transportResult(error: VultrInferenceError, latencyMs: number): ExplanationResult {
    return {
      explanation: null,
      validationStatus: "invalid",
      rejectionCode: "transport_error",
      issues: [
        `${error.message} The independent oracle verdict is unchanged; explanation unavailable.`,
      ],
      rawExplanationRedacted: null,
      metadata: {
        provider: "vultr",
        model: this.config.model,
        responseModel: null,
        requestId: null,
        latencyMs,
        tokensInput: null,
        tokensOutput: null,
        outcome: error.outcome,
        errorCode: error.code,
      },
    };
  }
}

/**
 * Shape a durable DB row for the explanation stage. The caller (worker,
 * Engineer 1) persists it; this function guarantees the recorded verdict
 * is the oracle's, never the model's, and that no secret-bearing material
 * is included.
 */
export interface ExplanationDbRecord {
  provider: "vultr";
  requestedModel: string;
  responseModel: string | null;
  requestId: string | null;
  latencyMs: number;
  tokensInput: number | null;
  tokensOutput: number | null;
  outcome: ModelCallOutcome;
  errorCode: string | null;
  attemptId: string;
  oracleVerdict: OracleVerdict;
  replayVerdict: ReplayVerdict | null;
  explanation: ModelExplanation | null;
  rawExplanationRedacted: unknown;
}

export function toExplanationDbRecord(
  input: ExplanationPromptInput,
  result: ExplanationResult,
): ExplanationDbRecord {
  return {
    provider: "vultr",
    requestedModel: result.metadata.model,
    responseModel: result.metadata.responseModel,
    requestId: result.metadata.requestId,
    latencyMs: result.metadata.latencyMs,
    tokensInput: result.metadata.tokensInput,
    tokensOutput: result.metadata.tokensOutput,
    outcome: result.metadata.outcome,
    errorCode: result.metadata.errorCode,
    attemptId: input.attemptId,
    oracleVerdict: input.oracleVerdict,
    replayVerdict: input.replayVerdict,
    explanation: result.explanation,
    rawExplanationRedacted: result.rawExplanationRedacted,
  };
}
