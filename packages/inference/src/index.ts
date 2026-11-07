/**
 * @highcastle/inference — server-only Vultr Serverless Inference adapter.
 *
 * Lane L12 owns this package. Import surface for the worker/orchestrator:
 * config resolution, the real client, prompt building, strict validation,
 * and typed errors. The test-only mock lives in `./mock.js` and is
 * intentionally NOT re-exported here so production code cannot reach it
 * through the package root.
 */

export {
  ALLOWED_BASE_PATH,
  DEFAULT_MAX_RETRIES,
  DEFAULT_MAX_TOKENS,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_VULTR_BASE_URL,
  VULTR_API_HOST,
  describeConfigForLogging,
  resolveVultrConfig,
  type ResolvedVultrConfig,
} from "./config.js";
export {
  INFERENCE_ERROR_CODES,
  VultrInferenceError,
  isRetryableCode,
  outcomeForCode,
  type InferenceErrorCode,
} from "./errors.js";
export {
  ALLOWED_HYPOTHESIS_PACK_ID,
  HYPOTHESIS_CATEGORY,
  MAX_ROUTE_SUMMARY_CHARS,
  MAX_SCOPE_SUMMARY_CHARS,
  MAX_SOURCE_CONTEXT_CHARS,
  buildHypothesisMessages,
  type ChatMessage,
  type HypothesisPromptInput,
} from "./prompt.js";
export {
  parseModelProposal,
  redactForStorage,
  type ProposalParseResult,
} from "./validate.js";
export {
  VultrInferenceClient,
  type ClientDeps,
  type GenerateHypothesisInput,
  type HypothesisResult,
  type ModelCallMetadata,
} from "./client.js";
