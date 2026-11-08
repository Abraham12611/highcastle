/**
 * @highcastle/security — deterministic authorization and policy engine (L04).
 *
 * The trusted boundary between AI-generated test proposals and permitted
 * operations. Pure module: no I/O, no network, no credentials, no model
 * calls. Every decision is an immutable `PolicyDecision` with audit-safe
 * reasons; every input is re-validated through `@highcastle/contracts`.
 *
 * Consumption map:
 * - L13 (policy gateway): `evaluatePlanAuthorization` for plan→execution
 *   gating; `evaluateRequestAuthorization` for per-attempt checks;
 *   `PolicyDecisionSchema` for persistence.
 * - L14 (sandbox): `EffectiveExecutionLimits` on `ApprovedExecution` seeds
 *   `SandboxResourceLimits`; `evaluateRequestAuthorization` + redirect
 *   helpers for follow-up request checks.
 * - L18 (BFF): `computeScopeHash` at approval time; request-level checks
 *   before scan creation.
 * - L15 (test packs): `resolvePermittedMethods` / pack manifest intersection.
 *
 * Test fixtures live at `@highcastle/security/testing` (test-only).
 */

export { deepFreeze } from "./freeze.js";

export {
  POLICY_ENGINE_VERSION,
  PolicyDenyCodeSchema,
  PolicyDenyReasonSchema,
  EffectiveExecutionLimitsSchema,
  ApprovedExecutionSchema,
  AuthorizedRequestSchema,
  AuthorizedSetupSchema,
  SetupOperationSchema,
  PolicyDecisionSchema,
  denyReason,
  allowDecision,
  denyDecision,
  type PolicyDenyCode,
  type PolicyDenyReason,
  type EffectiveExecutionLimits,
  type ApprovedExecution,
  type AuthorizedRequest,
  type AuthorizedSetup,
  type SetupOperation,
  type PolicyApproval,
  type PolicyDecision,
} from "./decisions.js";

export {
  SCOPE_HASH_VERSION,
  canonicalizeScope,
  stableStringify,
  computeScopeHash,
  verifyScopeHash,
  type ScopeHashFields,
  type ScopeHashInput,
} from "./scope-hash.js";

export { checkScopeStatus, checkScopeRelations, type ScopeRelationObjects } from "./scope-gate.js";

export {
  OperatorExecutionCapsSchema,
  DEFAULT_OPERATOR_CAPS,
  intersectExecutionBudget,
  checkRequestedBudget,
  type OperatorExecutionCaps,
} from "./budgets.js";

export {
  normalizeScopedPath,
  pathMatchesScopeEntry,
  checkPathPermitted,
  type PathCheckResult,
} from "./paths.js";

export {
  getPackManifest,
  isKnownPackId,
  resolvePermittedMethods,
  checkPackAuthorization,
  checkMethodPermitted,
} from "./packs.js";

export { resolveTargetServiceAlias, checkTargetAliasPermitted } from "./target-alias.js";

export {
  PACK_PREREQUISITES,
  resolveSetupOperations,
  isSetupOperation,
  checkSetupOperationPermitted,
  normalizeSetupPath,
} from "./prerequisites.js";

export {
  MAX_REDIRECTS,
  isIpLiteralHost,
  normalizeHostname,
  isDangerousHostname,
  assertSafeHostname,
  isHostInScope,
  isBlockedResolvedAddress,
  canonicalizeHttpsUrl,
  evaluateRedirect,
  checkUrlAllowed,
  type CanonicalUrl,
  type CanonicalizeResult,
  type RedirectCheckInput,
  type RedirectDecision,
} from "./url-policy.js";

export {
  REDACTED_VALUE,
  isSensitiveHeaderName,
  isSensitiveKey,
  looksLikeSecret,
  redactText,
  redactHeaders,
  redactUrlValue,
  redactValue,
  redactModelText,
  type RedactObjectOptions,
} from "./redaction.js";

export { validateModelProposal, type ProposalValidation } from "./proposal.js";

export {
  evaluatePlanAuthorization,
  evaluateRequestAuthorization,
  scopePolicyHash,
  type PlanAuthorizationInput,
  type RequestAuthorizationInput,
} from "./policy.js";
