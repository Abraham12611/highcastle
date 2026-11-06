import { z } from "zod";
import type {
  ModelCallOutcome,
  ModelProposal,
  ProposalRejectionCode,
  ProposalValidationStatus,
} from "@highcastle/contracts";
import {
  describeConfigForLogging,
  resolveVultrConfig,
  type ResolvedVultrConfig,
} from "./config.js";
import { VultrInferenceError, type InferenceErrorCode } from "./errors.js";
import {
  buildHypothesisMessages,
  type HypothesisPromptInput,
} from "./prompt.js";
import {
  parseModelProposal,
  redactForStorage,
} from "./validate.js";

/**
 * Server-side Vultr Serverless Inference client (Lane L12).
 *
 * OpenAI-compatible `POST {baseUrl}/chat/completions` over direct HTTPS —
 * no third-party SDK, no browser bundling, no fallback provider. Model
 * output is untrusted: only payloads that validate against the shared
 * `ModelProposalSchema` for the allowed `bola-invoice-v1` pack are
 * returned as proposals. Transport failures throw `VultrInferenceError`;
 * invalid model output is returned (not thrown) as an `invalid` result so
 * the orchestrator can record it and propagate `inconclusive`.
 *
 * OPEN UNCERTAINTY (Q05/Q13): exact model IDs, `response_format` support,
 * error-body shapes, and usage-field names are taken from the generic
 * OpenAI-compatible contract and have NOT yet been verified against the
 * live Vultr catalog. The client parses defensively and the README
 * documents the live smoke test that settles these questions.
 */

export interface ModelCallMetadata {
  provider: "vultr";
  model: string;
  requestId: string | null;
  latencyMs: number;
  tokensInput: number | null;
  tokensOutput: number | null;
  outcome: ModelCallOutcome;
  /** Machine-readable failure code, null on success. */
  errorCode: InferenceErrorCode | null;
}

export interface HypothesisResult {
  /** Validated proposal, or null when validation failed. */
  proposal: ModelProposal | null;
  validationStatus: ProposalValidationStatus;
  rejectionCode: ProposalRejectionCode | null;
  issues: string[];
  /** Sanitized model payload for safe storage — never raw secrets. */
  rawProposalRedacted: unknown;
  metadata: ModelCallMetadata;
}

export type GenerateHypothesisInput = HypothesisPromptInput;

export interface ClientDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Minimal defensive shape for an OpenAI-compatible chat completion. */
const ChatCompletionResponseSchema = z
  .object({
    id: z.string().optional(),
    choices: z
      .array(
        z.object({
          message: z
            .object({
              content: z.string().nullable().optional(),
            })
            .passthrough(),
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

function errorCodeForStatus(
  status: number,
  bodyText: string,
): { code: InferenceErrorCode; message: string } {
  const snippet = bodyText.slice(0, 300);
  if (status === 429) {
    return {
      code: "rate_limited",
      message: `Vultr inference rate limit hit (429). Backing off. Detail: ${snippet}`,
    };
  }
  if (status === 404 && /model/i.test(bodyText)) {
    return {
      code: "unavailable_model",
      message:
        "Vultr reports the configured model is unknown or unavailable (404). " +
        `Select a model ID from the live Vultr catalog. Detail: ${snippet}`,
    };
  }
  if (status === 401 || status === 403) {
    return {
      code: "provider_error",
      message:
        `Vultr rejected the request credentials (HTTP ${status}). ` +
        "Check VULTR_INFERENCE_API_KEY; the key itself is never logged.",
    };
  }
  if (status >= 500) {
    return {
      code: "provider_error",
      message: `Vultr inference server error (HTTP ${status}). Detail: ${snippet}`,
    };
  }
  return {
    code: "provider_error",
    message: `Vultr inference request failed (HTTP ${status}). Detail: ${snippet}`,
  };
}

export class VultrInferenceClient {
  private readonly config: ResolvedVultrConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(config: ResolvedVultrConfig, deps?: ClientDeps) {
    this.config = config;
    this.fetchImpl = deps?.fetchImpl ?? globalThis.fetch;
    this.sleep = deps?.sleep ?? defaultSleep;
    this.now = deps?.now ?? Date.now;
  }

  /** Build a real client from server environment. Never returns a mock. */
  static fromEnv(
    env: NodeJS.ProcessEnv = process.env,
    deps?: ClientDeps,
  ): VultrInferenceClient {
    return new VultrInferenceClient(resolveVultrConfig(env), deps);
  }

  /** Safe config summary for logs/telemetry — never includes the key. */
  describeForLogging(): ReturnType<typeof describeConfigForLogging> {
    return describeConfigForLogging(this.config);
  }

  get model(): string {
    return this.config.model;
  }

  async generateHypothesis(
    input: GenerateHypothesisInput,
  ): Promise<HypothesisResult> {
    const messages = buildHypothesisMessages(input);
    const startedAt = this.now();
    const requestBody = JSON.stringify({
      model: this.config.model,
      messages,
      // Request strict JSON when the provider honors the OpenAI-compatible
      // flag; strict parsing in validate.ts is authoritative regardless.
      response_format: { type: "json_object" },
      max_tokens: this.config.maxTokens,
      temperature: 0,
    });

    let attempt = 0;
    for (;;) {
      try {
        const response = await this.postCompletions(requestBody);
        const latencyMs = this.now() - startedAt;
        if (!response.ok) {
          const bodyText = await response.text().catch(() => "");
          const retryAfterMs = response.headers
            ? parseRetryAfterMs(response.headers.get("retry-after"))
            : null;
          const mapped = errorCodeForStatus(response.status, bodyText);
          if (
            (mapped.code === "rate_limited" ||
              mapped.code === "provider_error") &&
            attempt < this.config.maxRetries
          ) {
            await this.sleep(
              retryAfterMs ?? backoffMs(attempt),
            );
            attempt += 1;
            continue;
          }
          throw new VultrInferenceError(mapped.code, mapped.message, {
            httpStatus: response.status,
            retryAfterMs,
          });
        }
        return this.toResult(await response.text(), response, latencyMs);
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
          throw error;
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
          throw timeout;
        }
        const network = new VultrInferenceError(
          "provider_error",
          `Vultr inference network failure: ${toSafeMessage(error)}.`,
        );
        if (attempt < this.config.maxRetries) {
          await this.sleep(backoffMs(attempt));
          attempt += 1;
          continue;
        }
        throw network;
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
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private toResult(
    bodyText: string,
    response: Response,
    latencyMs: number,
  ): HypothesisResult {
    let parsed: unknown = null;
    let envelopeIssue: string | null = null;
    try {
      parsed = JSON.parse(bodyText) as unknown;
    } catch {
      envelopeIssue = "Provider returned a non-JSON envelope.";
    }
    const envelope =
      envelopeIssue === null
        ? ChatCompletionResponseSchema.safeParse(parsed)
        : null;
    if (envelope === null || !envelope.success) {
      return this.invalidResult(
        "malformed",
        "schema_mismatch",
        [envelopeIssue ?? "Provider envelope did not match chat completion shape."],
        redactForStorage(safeEnvelopePreview(bodyText)),
        response.headers.get("x-request-id"),
        latencyMs,
        null,
        null,
      );
    }
    const content = envelope.data.choices[0]?.message.content ?? null;
    const requestId =
      envelope.data.id ?? response.headers.get("x-request-id");
    const tokensInput =
      envelope.data.usage?.prompt_tokens ?? null;
    const tokensOutput =
      envelope.data.usage?.completion_tokens ?? null;
    if (typeof content !== "string" || content.trim().length === 0) {
      return this.invalidResult(
        "malformed",
        "empty_proposal",
        ["Provider returned empty message content."],
        redactForStorage(safeEnvelopePreview(bodyText)),
        requestId,
        latencyMs,
        tokensInput,
        tokensOutput,
      );
    }
    const parsedProposal = parseModelProposal(content);
    if (parsedProposal.status === "valid") {
      return {
        proposal: parsedProposal.proposal,
        validationStatus: "valid",
        rejectionCode: null,
        issues: [],
        rawProposalRedacted: redactForStorage(
          JSON.parse(content) as unknown,
        ),
        metadata: {
          provider: "vultr",
          model: this.config.model,
          requestId,
          latencyMs,
          tokensInput,
          tokensOutput,
          outcome: "success",
          errorCode: null,
        },
      };
    }
    const outcome: ModelCallOutcome =
      parsedProposal.rejectionCode === "forbidden_field" ||
      parsedProposal.rejectionCode === "unknown_pack" ||
      parsedProposal.rejectionCode === "out_of_scope_pack"
        ? "policy_conflict"
        : "malformed";
    return this.invalidResult(
      outcome,
      parsedProposal.rejectionCode,
      parsedProposal.issues,
      redactForStorage(safeEnvelopePreview(content)),
      requestId,
      latencyMs,
      tokensInput,
      tokensOutput,
    );
  }

  private invalidResult(
    code: "malformed" | "policy_conflict",
    rejectionCode: ProposalRejectionCode,
    issues: string[],
    rawProposalRedacted: unknown,
    requestId: string | null | undefined,
    latencyMs: number,
    tokensInput: number | null,
    tokensOutput: number | null,
  ): HypothesisResult {
    return {
      proposal: null,
      validationStatus: "invalid",
      rejectionCode,
      issues,
      rawProposalRedacted,
      metadata: {
        provider: "vultr",
        model: this.config.model,
        requestId: requestId ?? null,
        latencyMs,
        tokensInput,
        tokensOutput,
        outcome: code,
        errorCode: code,
      },
    };
  }
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException && error.name === "AbortError" ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name?: unknown }).name === "AbortError")
  );
}

function toSafeMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 200);
  return "unknown network error";
}

/** Keep a bounded preview of provider text for diagnostics, not storage. */
function safeEnvelopePreview(text: string): string {
  return text.length > 2000 ? `${text.slice(0, 2000)}…` : text;
}
