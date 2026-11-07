import { VultrInferenceError } from "./errors.js";

/**
 * Server-only configuration for the Vultr Serverless Inference adapter.
 *
 * Sourced exclusively from environment variables so no key or model ID is
 * ever hardcoded, bundled for the browser, or committed to Git:
 *
 * - `VULTR_INFERENCE_API_KEY` (required) — server-only secret.
 * - `VULTR_INFERENCE_MODEL` (required) — model ID chosen from the live
 *   Vultr catalog by the operator. No default: inventing a model ID would
 *   fabricate provider support we have not verified (open question Q05).
 * - `VULTR_INFERENCE_BASE_URL` (optional) — approved endpoint override.
 *   Defaults to `https://api.vultrinference.com/v1`. Any host other than
 *   `api.vultrinference.com` is rejected so a misconfiguration can never
 *   silently redirect LLM calls to OpenAI, Anthropic, or another provider.
 * - `VULTR_INFERENCE_TIMEOUT_MS` (optional, default 30000).
 * - `VULTR_INFERENCE_MAX_RETRIES` (optional, default 2 bounded retries).
 * - `VULTR_INFERENCE_MAX_TOKENS` (optional, default 1024 output budget).
 */

export const DEFAULT_VULTR_BASE_URL = "https://api.vultrinference.com/v1";
export const VULTR_API_HOST = "api.vultrinference.com";

export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_RETRIES = 2;
export const DEFAULT_MAX_TOKENS = 1024;

export const MAX_TIMEOUT_MS = 120_000;
export const MAX_RETRIES_CAP = 4;
export const MAX_TOKENS_CAP = 4096;

export interface ResolvedVultrConfig {
  /** Raw key — held in memory only, never logged or serialized. */
  apiKey: string;
  /** Operator-selected model ID from the live Vultr catalog. */
  model: string;
  /** Normalized base URL with no trailing slash. */
  baseUrl: string;
  /** Per-attempt request timeout in milliseconds. */
  timeoutMs: number;
  /** Bounded retries for transient failures (429/5xx/timeout). */
  maxRetries: number;
  /** Output token budget per request. */
  maxTokens: number;
}

function readTrimmed(env: NodeJS.ProcessEnv, name: string): string | null {
  const raw = env[name];
  if (raw === undefined) return null;
  const value = raw.trim();
  return value.length > 0 ? value : null;
}

function readPositiveInt(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  cap: number,
): number {
  const raw = readTrimmed(env, name);
  if (raw === null) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new VultrInferenceError(
      "invalid_config",
      `${name} must be a positive integer, got redacted invalid value.`,
    );
  }
  return Math.min(parsed, cap);
}

/**
 * The only accepted inference base path: the documented Vultr
 * Serverless Inference OpenAI-compatible root.
 */
export const ALLOWED_BASE_PATH = "/v1";

function normalizeBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new VultrInferenceError(
      "invalid_config",
      "VULTR_INFERENCE_BASE_URL is not a valid URL.",
    );
  }
  if (url.protocol !== "https:") {
    throw new VultrInferenceError(
      "invalid_config",
      "VULTR_INFERENCE_BASE_URL must use https.",
    );
  }
  if (url.username !== "" || url.password !== "") {
    throw new VultrInferenceError(
      "invalid_config",
      "VULTR_INFERENCE_BASE_URL must not embed credentials in URL userinfo.",
    );
  }
  if (url.hostname.toLowerCase() !== VULTR_API_HOST) {
    throw new VultrInferenceError(
      "non_vultr_endpoint_blocked",
      `Refusing non-Vultr inference endpoint host "${url.hostname}". ` +
        `Hackathon Challenge 1 requires Vultr Serverless Inference; ` +
        `no silent fallback to another provider is permitted.`,
    );
  }
  if (url.port !== "") {
    throw new VultrInferenceError(
      "invalid_config",
      "VULTR_INFERENCE_BASE_URL must not specify an unexpected port.",
    );
  }
  if (url.search !== "" || url.hash !== "") {
    throw new VultrInferenceError(
      "invalid_config",
      "VULTR_INFERENCE_BASE_URL must not include a query string or fragment.",
    );
  }
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path !== ALLOWED_BASE_PATH) {
    throw new VultrInferenceError(
      "invalid_config",
      "VULTR_INFERENCE_BASE_URL must be exactly the documented Vultr base path /v1.",
    );
  }
  return `https://${VULTR_API_HOST}${ALLOWED_BASE_PATH}`;
}

/**
 * Resolve and validate server-side Vultr config from the environment.
 * Throws `VultrInferenceError` (never logs values) when required values
 * are absent or the endpoint is not an approved Vultr host.
 */
export function resolveVultrConfig(
  env: NodeJS.ProcessEnv = process.env,
): ResolvedVultrConfig {
  const apiKey = readTrimmed(env, "VULTR_INFERENCE_API_KEY");
  if (apiKey === null) {
    throw new VultrInferenceError(
      "missing_credentials",
      "VULTR_INFERENCE_API_KEY is not set. " +
        "Configure a server-only Vultr Serverless Inference key; " +
        "no fallback provider will be used.",
    );
  }
  const model = readTrimmed(env, "VULTR_INFERENCE_MODEL");
  if (model === null) {
    throw new VultrInferenceError(
      "missing_model",
      "VULTR_INFERENCE_MODEL is not set. " +
        "Select a model ID from the live Vultr catalog; " +
        "no model ID is hardcoded by this adapter.",
    );
  }
  const baseRaw =
    readTrimmed(env, "VULTR_INFERENCE_BASE_URL") ?? DEFAULT_VULTR_BASE_URL;
  return {
    apiKey,
    model,
    baseUrl: normalizeBaseUrl(baseRaw),
    timeoutMs: readPositiveInt(env, "VULTR_INFERENCE_TIMEOUT_MS", DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS),
    maxRetries: readPositiveInt(env, "VULTR_INFERENCE_MAX_RETRIES", DEFAULT_MAX_RETRIES, MAX_RETRIES_CAP),
    maxTokens: readPositiveInt(env, "VULTR_INFERENCE_MAX_TOKENS", DEFAULT_MAX_TOKENS, MAX_TOKENS_CAP),
  };
}

/** Safe summary of resolved config for logs/telemetry — never the key. */
export function describeConfigForLogging(config: ResolvedVultrConfig): {
  model: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  maxTokens: number;
  credentialsPresent: boolean;
} {
  return {
    model: config.model,
    baseUrl: config.baseUrl,
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries,
    maxTokens: config.maxTokens,
    credentialsPresent: config.apiKey.length > 0,
  };
}
