import type { ModelCallOutcome } from "@highcastle/contracts";

/**
 * Machine-readable failure codes for the Vultr inference adapter.
 *
 * Every code maps to a `ModelCallOutcome` so the orchestrator (L16) can
 * record the call and propagate `inconclusive` instead of inventing a result.
 * Details attached to these errors are always safe to log: they never carry
 * the API key, raw prompts, or response bodies.
 */
export const INFERENCE_ERROR_CODES = [
  "missing_credentials",
  "missing_model",
  "invalid_config",
  "non_vultr_endpoint_blocked",
  "mock_not_allowed",
  "timeout",
  "rate_limited",
  "malformed",
  "policy_conflict",
  "unavailable_model",
  "provider_error",
] as const;

export type InferenceErrorCode = (typeof INFERENCE_ERROR_CODES)[number];

const OUTCOME_BY_CODE: Record<InferenceErrorCode, ModelCallOutcome> = {
  missing_credentials: "error",
  missing_model: "error",
  invalid_config: "error",
  non_vultr_endpoint_blocked: "error",
  mock_not_allowed: "error",
  timeout: "timeout",
  rate_limited: "rate_limited",
  malformed: "malformed",
  policy_conflict: "policy_conflict",
  unavailable_model: "error",
  provider_error: "error",
};

/** Retry only transient failures; never retry auth, config, or bad output. */
const RETRYABLE_CODES: ReadonlySet<InferenceErrorCode> = new Set([
  "timeout",
  "rate_limited",
  "provider_error",
]);

export function outcomeForCode(code: InferenceErrorCode): ModelCallOutcome {
  return OUTCOME_BY_CODE[code];
}

export function isRetryableCode(code: InferenceErrorCode): boolean {
  return RETRYABLE_CODES.has(code);
}

export class VultrInferenceError extends Error {
  readonly code: InferenceErrorCode;
  /** HTTP status from Vultr when one was received, otherwise null. */
  readonly httpStatus: number | null;
  /** Advised wait before retrying (ms), derived from Retry-After, if any. */
  readonly retryAfterMs: number | null;

  constructor(
    code: InferenceErrorCode,
    message: string,
    options?: { httpStatus?: number | null; retryAfterMs?: number | null },
  ) {
    super(message);
    this.name = "VultrInferenceError";
    this.code = code;
    this.httpStatus = options?.httpStatus ?? null;
    this.retryAfterMs = options?.retryAfterMs ?? null;
  }

  get outcome(): ModelCallOutcome {
    return outcomeForCode(this.code);
  }

  get retryable(): boolean {
    return isRetryableCode(this.code);
  }
}
