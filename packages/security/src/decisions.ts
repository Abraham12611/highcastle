import { z } from "zod";
import {
  AuthorizationScopeIdSchema,
  IsoUtcDateTimeSchema,
  ScopeHashSchema,
  SemVerSchema,
  TargetServiceAliasSchema,
  TestPackIdSchema,
  TestPackMethodSchema,
} from "@highcastle/contracts";
import { deepFreeze } from "./freeze.js";

/**
 * Structured, audit-safe policy decisions.
 *
 * Every answer this module produces is a `PolicyDecision`: either an `allow`
 * carrying an immutable `ApprovedExecution`/`AuthorizedRequest` envelope, or
 * a `deny` carrying one or more machine-readable `PolicyDenyReason`s. Deny
 * details are bounded plaintext — safe to persist as audit `safeSummary`
 * material and safe to surface to the caller; they never echo secrets,
 * credentials or unbounded model text.
 *
 * Precedence (security/02_CONTAINMENT_AND_AUTHORIZATION):
 *   operator hard caps → project/target authorization → signed scope
 *   snapshot → approval → test pack declaration → model-requested action.
 * Intersection only: a lower layer can narrow, never broaden.
 */

/** Bumped on any semantic change to evaluation logic; stamped on decisions. */
export const POLICY_ENGINE_VERSION = "l04-policy-1.0.0" as const;

export const PolicyDenyCodeSchema = z.enum([
  // --- Input / integrity ---
  "scope_malformed",
  "scope_hash_mismatch",
  "project_malformed",
  "target_malformed",
  "environment_malformed",
  "operator_caps_malformed",
  // --- Scope validity ---
  "scope_revoked",
  "scope_expired",
  "scope_not_yet_valid",
  // --- Authorization relations ---
  "workspace_mismatch",
  "project_mismatch",
  "project_not_active",
  "target_mismatch",
  "target_not_verified",
  "environment_mismatch",
  "environment_not_ready",
  "unsupported_target_kind",
  // --- Test-pack / action surface ---
  "pack_unknown",
  "pack_not_permitted",
  "method_not_permitted",
  "path_not_permitted",
  "path_explicitly_denied",
  "host_out_of_scope",
  "budget_exceeded",
  // --- Model proposal rejections ---
  "proposal_empty",
  "proposal_malformed",
  "proposal_forbidden_field",
  "proposal_stale_version",
  "proposal_unknown_pack",
  // --- URL / redirect safety ---
  "unsafe_url",
  "unsafe_scheme",
  "unsafe_hostname",
  "unsafe_credentials_in_url",
  "unsafe_port",
  "redirect_target_denied",
  "redirect_limit_exceeded",
]);
export type PolicyDenyCode = z.infer<typeof PolicyDenyCodeSchema>;

export const PolicyDenyReasonSchema = z
  .object({
    code: PolicyDenyCodeSchema,
    /** Bounded, secret-free, single-line audit detail. */
    detail: z.string().min(1).max(280),
  })
  .strict();
export type PolicyDenyReason = Readonly<z.infer<typeof PolicyDenyReasonSchema>>;

/** Effective per-attempt budget = operator ∩ scope ∩ pack ∩ sandbox caps. */
export const EffectiveExecutionLimitsSchema = z
  .object({
    maxDurationSeconds: z.number().int().min(1),
    maxRequests: z.number().int().min(1),
    maxConcurrency: z.number().int().min(1),
    maxMemoryMb: z.number().int().min(1),
    maxCpuMillicores: z.number().int().min(1),
    maxPids: z.number().int().min(1),
  })
  .strict();
export type EffectiveExecutionLimits = Readonly<z.infer<typeof EffectiveExecutionLimitsSchema>>;

/**
 * What L13 hands to the sandbox controller (L14) after an `allow`. It is the
 * *only* shape the executor can receive: enumerated pack, allowlisted service
 * alias, narrowed method list and intersected caps — never a raw host, URL,
 * command or credential value.
 */
export const ApprovedExecutionSchema = z
  .object({
    /** Discriminant for the approval union — plan-level execution grant. */
    kind: z.literal("execution"),
    scopeId: AuthorizationScopeIdSchema,
    packId: TestPackIdSchema,
    packVersion: SemVerSchema,
    targetServiceAlias: TargetServiceAliasSchema,
    permittedMethods: z.array(TestPackMethodSchema).min(1),
    limits: EffectiveExecutionLimitsSchema,
    /** Execution must finish before the scope expires. */
    expiresAt: IsoUtcDateTimeSchema,
  })
  .strict();
export type ApprovedExecution = Readonly<z.infer<typeof ApprovedExecutionSchema>>;

/** Per-request allow envelope (host/method/path gate, L13/L18/L14). */
export const AuthorizedRequestSchema = z
  .object({
    /** Discriminant for the approval union — single HTTP action grant. */
    kind: z.literal("request"),
    scopeId: AuthorizationScopeIdSchema,
    method: TestPackMethodSchema,
    /** Canonicalized request path actually permitted (query stripped). */
    path: z.string().min(1).max(1024),
    /** Scope-approved hostname; null when the caller did not supply one. */
    host: z.string().min(1).max(253).nullable(),
  })
  .strict();
export type AuthorizedRequest = Readonly<z.infer<typeof AuthorizedRequestSchema>>;

const ApprovalSchema = z.union([ApprovedExecutionSchema, AuthorizedRequestSchema]);
export type PolicyApproval = ApprovedExecution | AuthorizedRequest;

export const PolicyDecisionSchema = z.discriminatedUnion("decision", [
  z
    .object({
      decision: z.literal("allow"),
      policyVersion: z.string().min(1).max(32),
      /** Immutable scope snapshot hash this decision was made against. */
      policyHash: ScopeHashSchema,
      approval: ApprovalSchema,
    })
    .strict(),
  z
    .object({
      decision: z.literal("deny"),
      policyVersion: z.string().min(1).max(32),
      /** null when the scope could not be parsed/hashed at all. */
      policyHash: ScopeHashSchema.nullable(),
      reasons: z.array(PolicyDenyReasonSchema).min(1),
    })
    .strict(),
]);
export type PolicyDecision = Readonly<z.infer<typeof PolicyDecisionSchema>>;

/** Build a bounded, audit-safe reason. Details are truncated, never secrets. */
export function denyReason(code: PolicyDenyCode, detail: string): PolicyDenyReason {
  const singleLine = detail.replace(/[\r\n]+/g, " ").trim();
  const bounded = singleLine.length > 280 ? `${singleLine.slice(0, 277)}...` : singleLine;
  return deepFreeze({ code, detail: bounded || "no detail" });
}

export function allowDecision(approval: PolicyApproval, policyHash: string) {
  return deepFreeze({
    decision: "allow" as const,
    policyVersion: POLICY_ENGINE_VERSION,
    policyHash,
    approval,
  }) satisfies PolicyDecision;
}

export function denyDecision(reasons: readonly PolicyDenyReason[], policyHash: string | null) {
  const list =
    reasons.length > 0
      ? [...reasons]
      : [denyReason("scope_malformed", "policy evaluation produced no result")];
  return deepFreeze({
    decision: "deny" as const,
    policyVersion: POLICY_ENGINE_VERSION,
    policyHash,
    reasons: list,
  }) satisfies PolicyDecision;
}
