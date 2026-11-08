import { z } from "zod";
import {
  AssertionOutcomeSchema,
  OracleVerdictSchema,
  ReplayVerdictSchema,
  TestPackIdSchema,
} from "./enums.js";
import {
  AttemptIdSchema,
  AuthorizationScopeIdSchema,
  EnvironmentIdSchema,
  FindingIdSchema,
  ProjectIdSchema,
  ReplayIdSchema,
  ScanIdSchema,
  WorkspaceIdSchema,
} from "./ids.js";
import { IsoUtcDateTimeSchema, SemVerSchema } from "./common.js";

/**
 * Replay and independent verification verdicts.
 *
 * Invariants (ADR-009, agents/02_TEST_PACK_AND_VERIFICATION):
 * - A replay references the original attempt + an updated target revision and
 *   executes the SAME versioned test pack — never a rewritten test.
 * - `verified_fixed` requires BOTH: legitimate own-invoice read passes AND
 *   the cross-account read is denied, on the documented patched revision.
 * - The client can request a replay but can NEVER set the verdict: the
 *   request schema has no verdict field, and the verdict is derived by
 *   deterministic code from recorded observations.
 *
 * Consumers: L15 (oracle), L16 (replay jobs), L18 (replay endpoints),
 * L10 (before/after UI).
 */

// --- Replay request (POST /findings/:fid/replays) ---

export const ReplayRequestSchema = z
  .object({
    originalAttemptId: AttemptIdSchema,
    patchedEnvironmentId: EnvironmentIdSchema,
    patchedRevision: z.string().min(1).max(128),
    authorizationScopeId: AuthorizationScopeIdSchema,
  })
  .strict();
export type ReplayRequest = z.infer<typeof ReplayRequestSchema>;

export const ReplaySchema = z
  .object({
    id: ReplayIdSchema,
    workspaceId: WorkspaceIdSchema,
    projectId: ProjectIdSchema,
    findingId: FindingIdSchema,
    originalAttemptId: AttemptIdSchema,
    originalScanId: ScanIdSchema,
    replayScanId: ScanIdSchema,
    patchedEnvironmentId: EnvironmentIdSchema,
    patchedRevision: z.string().min(1).max(128),
    packId: TestPackIdSchema,
    packVersion: SemVerSchema,
    approvalScopeId: AuthorizationScopeIdSchema,
    positiveAssertionPassed: z.boolean().nullable(),
    negativeAssertionPassed: z.boolean().nullable(),
    verdict: ReplayVerdictSchema.nullable(),
    createdAt: IsoUtcDateTimeSchema,
    completedAt: IsoUtcDateTimeSchema.nullable(),
  })
  .strict();
export type Replay = z.infer<typeof ReplaySchema>;

// --- Independent verification verdict ---

/**
 * Deterministic oracle output for one attempt. `verdict` is derived from the
 * two legs — callers MUST use `evaluateAttemptVerdict`, not set it by hand.
 */
export const VerificationVerdictSchema = z
  .object({
    attemptId: AttemptIdSchema,
    oracleVersion: z.string().min(1).max(64),
    /** P1: legitimate own-invoice read works (baseline healthy). */
    baseline: AssertionOutcomeSchema,
    /** S1: cross-account read denied (pass) vs data returned (fail). */
    securityCheck: AssertionOutcomeSchema,
    verdict: OracleVerdictSchema,
  })
  .strict();
export type VerificationVerdict = z.infer<typeof VerificationVerdictSchema>;

export interface AttemptObservation {
  baseline: z.infer<typeof AssertionOutcomeSchema>;
  securityCheck: z.infer<typeof AssertionOutcomeSchema>;
}

/**
 * BOLA verdict matrix (agents/02_TEST_PACK_AND_VERIFICATION):
 * - baseline pass + cross-account data returned -> reproduced
 * - baseline pass + cross-account denied        -> not_reproduced
 * - anything else                               -> inconclusive
 */
export function evaluateAttemptVerdict(
  observation: AttemptObservation,
): z.infer<typeof OracleVerdictSchema> {
  if (observation.baseline === "pass" && observation.securityCheck === "fail") {
    return "reproduced";
  }
  if (observation.baseline === "pass" && observation.securityCheck === "pass") {
    return "not_reproduced";
  }
  return "inconclusive";
}

export function buildVerificationVerdict(
  attemptId: z.infer<typeof AttemptIdSchema>,
  oracleVersion: string,
  observation: AttemptObservation,
): VerificationVerdict {
  return {
    attemptId,
    oracleVersion,
    baseline: observation.baseline,
    securityCheck: observation.securityCheck,
    verdict: evaluateAttemptVerdict(observation),
  };
}

// --- Replay verdict matrix ---

export interface ReplayObservation {
  /** Legitimate own-invoice read on the patched revision. */
  legitimateRead: z.infer<typeof AssertionOutcomeSchema>;
  /** Cross-account read on the patched revision (pass = denied). */
  unauthorizedReadDenied: z.infer<typeof AssertionOutcomeSchema>;
  /** True when the patched run independently reproduced data access. */
  stillReadsCrossAccount: boolean;
}

/**
 * Replay verdict matrix (04_RELATIONSHIPS_AND_STATES):
 * - cross-account read STILL returns data        -> still_vulnerable
 * - denied AND own read works                    -> verified_fixed
 * - denied but own read ALSO broken              -> regression
 * - anything uncertain                           -> inconclusive
 */
export function evaluateReplayVerdict(
  observation: ReplayObservation,
): z.infer<typeof ReplayVerdictSchema> {
  if (observation.stillReadsCrossAccount) {
    return "still_vulnerable";
  }
  if (
    observation.unauthorizedReadDenied === "pass" &&
    observation.legitimateRead === "pass"
  ) {
    return "verified_fixed";
  }
  if (
    observation.unauthorizedReadDenied === "pass" &&
    observation.legitimateRead === "fail"
  ) {
    return "regression";
  }
  return "inconclusive";
}
