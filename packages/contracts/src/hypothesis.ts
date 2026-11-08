import { z } from "zod";
import {
  FindingCategorySchema,
  ModelCallOutcomeSchema,
  ModelProviderSchema,
  ModelPurposeSchema,
  ProposalValidationStatusSchema,
  TestPackIdSchema,
} from "./enums.js";
import {
  ModelCallIdSchema,
  ProposalIdSchema,
  ScanIdSchema,
  WorkspaceIdSchema,
} from "./ids.js";
import { IsoUtcDateTimeSchema, ScopeHashSchema } from "./common.js";
import { ContractSchemaVersionSchema } from "./version.js";

/**
 * AI hypothesis and structured test-plan contracts.
 *
 * CRITICAL SECURITY RULE — read before touching this file:
 * model output can NEVER grant itself execution permissions and can NEVER
 * name unrestricted commands or target hosts. The schema enforces this by
 * construction:
 *
 * - `RequestedTestSchema` has exactly two fields: an enumerated `packId`
 *   (today only `bola-invoice-v1`) and a short human-readable `objective`.
 *   There is no `command`, `shell`, `url`, `host`, `target`, `permissions`,
 *   `scope`, `credentials`, or `extraArgs` field — not even an optional one.
 * - Every object is `.strict()`: prompt-injected keys such as `shellCommand`,
 *   `targetUrl`, `grantPermissions` or `allowedHosts` fail validation and are
 *   logged as `policy_conflict`/`malformed` rejections, never executed.
 * - Authority flows one way only: human-approved scope (L04/L13) -> runner.
 *   The plan is intersected against that scope by deterministic code; the
 *   model may only *narrow* the choice to a pre-approved pack.
 *
 * Consumers: L12 (normalize Vultr output through `ModelProposalSchema`),
 * L13 (validate + intersect before any sandbox call), L16 (bounded replan).
 */

/** Bounded replan budget: at most this many model retries per scan stage. */
export const MAX_MODEL_REPLANS = 2 as const;

export const HypothesisSchema = z
  .object({
    category: FindingCategorySchema,
    /** Component under test, e.g. `invoice_lookup`. Free text, bounded. */
    targetComponent: z.string().min(1).max(120),
    /** Why the check is worthwhile, e.g. `Ownership check may be absent`. */
    reason: z.string().min(1).max(500),
    /** Secure behavior the test asserts, e.g. `A customer cannot read
     * another customer's invoice`. */
    expectedSecureBehavior: z.string().min(1).max(500),
  })
  .strict();
export type Hypothesis = z.infer<typeof HypothesisSchema>;

export const RequestedTestSchema = z
  .object({
    packId: TestPackIdSchema,
    objective: z
      .string()
      .min(1)
      .max(280)
      .refine((v) => !/[`$\\]/.test(v), {
        message: "Objective must be plain prose, not shell syntax",
      }),
  })
  .strict();
export type RequestedTest = z.infer<typeof RequestedTestSchema>;

/**
 * The ONLY shape accepted from model output. Any deviation — unknown keys,
 * unknown pack, wrong version, shell metacharacters in prose — is a rejection,
 * not a fallback to execution.
 */
export const ModelProposalSchema = z
  .object({
    schemaVersion: ContractSchemaVersionSchema,
    hypothesis: HypothesisSchema,
    requestedTest: RequestedTestSchema,
  })
  .strict();
export type ModelProposal = z.infer<typeof ModelProposalSchema>;

/** Rejection codes for invalid proposals (stored, audited, never executed). */
export const ProposalRejectionCodeSchema = z.enum([
  "schema_mismatch",
  "unknown_pack",
  "out_of_scope_pack",
  "forbidden_field",
  "stale_version",
  "empty_proposal",
]);
export type ProposalRejectionCode = z.infer<typeof ProposalRejectionCodeSchema>;

// --- Stored provider call + proposal records (L02 rows, L12 writes) ---

export const ModelCallSchema = z
  .object({
    id: ModelCallIdSchema,
    workspaceId: WorkspaceIdSchema,
    scanId: ScanIdSchema,
    provider: ModelProviderSchema,
    /** Model identifier from the live Vultr list (env-selected, not fixed). */
    model: z.string().min(1).max(128),
    purpose: ModelPurposeSchema,
    requestId: z.string().min(1).max(128).nullable(),
    tokensInput: z.number().int().min(0).nullable(),
    tokensOutput: z.number().int().min(0).nullable(),
    latencyMs: z.number().int().min(0).nullable(),
    outcome: ModelCallOutcomeSchema,
    errorCode: z.string().min(1).max(128).nullable(),
    createdAt: IsoUtcDateTimeSchema,
  })
  .strict();
export type ModelCall = z.infer<typeof ModelCallSchema>;

export const AgentProposalSchema = z
  .object({
    id: ProposalIdSchema,
    workspaceId: WorkspaceIdSchema,
    scanId: ScanIdSchema,
    modelCallId: ModelCallIdSchema,
    schemaVersion: ContractSchemaVersionSchema,
    /** Sanitized model output; raw prompts/credentials are never stored. */
    rawProposalRedacted: z.unknown(),
    /** Parsed plan; null when validation failed (see `rejectionCode`). */
    structuredPlan: ModelProposalSchema.nullable(),
    validationStatus: ProposalValidationStatusSchema,
    rejectionCode: ProposalRejectionCodeSchema.nullable(),
    policyHash: ScopeHashSchema.nullable(),
    createdAt: IsoUtcDateTimeSchema,
  })
  .strict();
export type AgentProposal = z.infer<typeof AgentProposalSchema>;
