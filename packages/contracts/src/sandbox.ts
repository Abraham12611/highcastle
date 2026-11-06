import { z } from "zod";
import {
  ContainmentRuleIdSchema,
  RunnerStatusSchema,
  SandboxResultStatusSchema,
  TestPackIdSchema,
  TestPackMethodSchema,
} from "./enums.js";
import {
  AttemptIdSchema,
  ContainmentEventIdSchema,
  RunnerInstanceIdSchema,
  ScanIdSchema,
  WorkspaceIdSchema,
} from "./ids.js";
import {
  AttemptNonceSchema,
  IsoUtcDateTimeSchema,
  SafeSummarySchema,
  ScopeHashSchema,
  SemVerSchema,
  Sha256HexSchema,
} from "./common.js";
import { ContractSchemaVersionSchema } from "./version.js";

/**
 * Sandbox runner protocol (internal, controller-only) and containment events.
 *
 * The controller (L14) is the only writer of `SandboxRequest`; the runner
 * returns `SandboxResult`. Neither shape carries an arbitrary URL, shell
 * string, credential, or privilege flag — by construction, not by convention:
 * unknown keys are rejected, the target is an allowlisted service alias, and
 * the credential is an opaque server-side reference resolved by the
 * controller, never a secret value.
 *
 * Consumers: L14 (spawn/kill/protocol), L13 (build the request after policy
 * allow), L15 (pack execution + oracle input), L02 (persistence).
 */

// --- Target allowlist ---

/**
 * H demo: the runner may reach exactly one service — the owned synthetic
 * lab on the isolated lab network. Any other value fails validation.
 * Later environments add aliases here with coordinator + L04/L19 approval.
 */
export const TargetServiceAliasSchema = z.enum(["target-lab"]);
export type TargetServiceAlias = z.infer<typeof TargetServiceAliasSchema>;

/**
 * Opaque credential handle, e.g. `ref:synthetic:alice_session`. The runner
 * receives only the handle; only the controller resolves it to a short-lived
 * synthetic-lab token. Secret *values* never appear in any contract.
 */
export const CredentialRefSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^ref:[a-z0-9:_-]+$/, "Credential must be an opaque ref, not a value");
export type CredentialRef = z.infer<typeof CredentialRefSchema>;

// --- Resource limits + H hard caps ---

export const SANDBOX_HARD_CAPS = {
  maxDurationSeconds: 120,
  maxRequests: 16,
  maxMemoryMb: 512,
  maxCpuMillicores: 1000,
  maxPids: 64,
} as const;

export const SandboxResourceLimitsSchema = z
  .object({
    maxDurationSeconds: z
      .number()
      .int()
      .min(1)
      .max(SANDBOX_HARD_CAPS.maxDurationSeconds),
    maxRequests: z.number().int().min(1).max(SANDBOX_HARD_CAPS.maxRequests),
    maxMemoryMb: z.number().int().min(64).max(SANDBOX_HARD_CAPS.maxMemoryMb),
    maxCpuMillicores: z
      .number()
      .int()
      .min(100)
      .max(SANDBOX_HARD_CAPS.maxCpuMillicores),
    maxPids: z.number().int().min(8).max(SANDBOX_HARD_CAPS.maxPids),
  })
  .strict();
export type SandboxResourceLimits = z.infer<typeof SandboxResourceLimitsSchema>;

// --- Controller -> runner request ---

export const SandboxRequestSchema = z
  .object({
    schemaVersion: ContractSchemaVersionSchema,
    scanId: ScanIdSchema,
    attemptId: AttemptIdSchema,
    /** Immutable scope/policy snapshot this attempt executes under. */
    policyHash: ScopeHashSchema,
    packId: TestPackIdSchema,
    packVersion: SemVerSchema,
    targetServiceAlias: TargetServiceAliasSchema,
    actorCredentialRef: CredentialRefSchema,
    nonce: AttemptNonceSchema,
    permittedMethods: z.array(TestPackMethodSchema).min(1),
    limits: SandboxResourceLimitsSchema,
    /** Pinned lab image digest; a changed digest blocks the attempt. */
    targetImageDigest: z.string().min(1).max(256),
  })
  .strict();
export type SandboxRequest = z.infer<typeof SandboxRequestSchema>;

// --- Runner -> controller result ---

const SanitizedHttpExchangeSchema = z
  .object({
    method: TestPackMethodSchema,
    /** Redacted path (no query credentials); host is always the lab alias. */
    path: z.string().min(1).max(1024),
    status: z.number().int().min(100).max(599),
    bodyHash: Sha256HexSchema,
    /** Short redacted excerpt for debugging; never full bodies. */
    bodyExcerptRedacted: z.string().max(2000).optional(),
  })
  .strict();

export const AssertionEvidenceSchema = z
  .object({
    passed: z.boolean(),
    detail: z.string().max(500),
  })
  .strict();
export type AssertionEvidence = z.infer<typeof AssertionEvidenceSchema>;

export const SandboxResultSchema = z
  .object({
    schemaVersion: ContractSchemaVersionSchema,
    attemptId: AttemptIdSchema,
    runnerId: RunnerInstanceIdSchema,
    /** Echo of the request nonce; mismatched results are discarded. */
    nonce: AttemptNonceSchema,
    status: SandboxResultStatusSchema,
    exitCode: z.number().int().min(0).max(255).nullable(),
    /** P1: Alice reads her own invoice. */
    baselineAssertion: AssertionEvidenceSchema,
    /** S1: Alice's cross-account read must be denied (patched) or observed. */
    negativeAssertion: AssertionEvidenceSchema,
    exchanges: z.array(SanitizedHttpExchangeSchema).max(32),
    observedFixtureOwner: z.enum(["alice", "bob", "none"]).optional(),
    resourceUsage: z
      .object({
        wallMs: z.number().int().min(0),
        maxRssMb: z.number().int().min(0).nullable(),
        requestsMade: z.number().int().min(0),
      })
      .strict(),
    containmentEventIds: z.array(ContainmentEventIdSchema).max(32).default([]),
    artifactDigests: z.array(Sha256HexSchema).max(32).default([]),
    completedAt: IsoUtcDateTimeSchema,
  })
  .strict();
export type SandboxResult = z.infer<typeof SandboxResultSchema>;

// --- Containment events (policy or runtime denials; NOT findings) ---

export const ContainmentEventSchema = z
  .object({
    id: ContainmentEventIdSchema,
    workspaceId: WorkspaceIdSchema,
    scanId: ScanIdSchema,
    attemptId: AttemptIdSchema.nullable(),
    runnerId: RunnerInstanceIdSchema,
    ruleId: ContainmentRuleIdSchema,
    policyVersion: z.string().min(1).max(32),
    deniedOperation: z.string().min(1).max(200),
    /**
     * A containment event records a DENIAL. `allowed` is always false and
     * `runtimeEnforced` always true: the block was enforced by the runtime,
     * not merely claimed by a policy message.
     */
    allowed: z.literal(false),
    runtimeEnforced: z.literal(true),
    observedAt: IsoUtcDateTimeSchema,
    safeSummary: SafeSummarySchema,
    safeMetadata: z
      .record(z.union([z.string(), z.number(), z.boolean()]))
      .optional(),
  })
  .strict();
export type ContainmentEvent = z.infer<typeof ContainmentEventSchema>;

// --- Runner instance lifecycle (L14 rows) ---

export const RunnerInstanceSchema = z
  .object({
    id: RunnerInstanceIdSchema,
    workspaceId: WorkspaceIdSchema,
    scanId: ScanIdSchema,
    sandboxId: z.string().min(1).max(128),
    imageDigest: z.string().min(1).max(256),
    networkProfile: z.string().min(1).max(128),
    limits: SandboxResourceLimitsSchema,
    status: RunnerStatusSchema,
    createdAt: IsoUtcDateTimeSchema,
    startedAt: IsoUtcDateTimeSchema.nullable(),
    terminatedAt: IsoUtcDateTimeSchema.nullable(),
    cleanupVerifiedAt: IsoUtcDateTimeSchema.nullable(),
    timeoutAt: IsoUtcDateTimeSchema.nullable(),
    exitCode: z.number().int().min(0).max(255).nullable(),
    reason: z.string().max(500).nullable(),
  })
  .strict();
export type RunnerInstance = z.infer<typeof RunnerInstanceSchema>;
