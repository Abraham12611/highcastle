import { z } from "zod";
import {
  SANDBOX_HARD_CAPS,
  SCOPE_HARD_CAPS,
  TEST_PACK_MANIFEST,
  type AuthorizationScope,
  type TestPackId,
} from "@highcastle/contracts";
import {
  EffectiveExecutionLimitsSchema,
  denyReason,
  type EffectiveExecutionLimits,
  type PolicyDenyReason,
} from "./decisions.js";
import { deepFreeze } from "./freeze.js";

/**
 * Execution-budget intersection.
 *
 * Precedence: operator hard caps → approved scope → pack declaration →
 * sandbox hard ceiling. The effective budget is the component-wise MINIMUM —
 * the model and the approval flow can only narrow it, never widen it, and
 * the runtime ceiling (`SANDBOX_HARD_CAPS`) can never be exceeded by any
 * input. `OperatorExecutionCaps` is the deployment-time ceiling supplied by
 * the control plane; `DEFAULT_OPERATOR_CAPS` equals the H sandbox caps.
 */

export const OperatorExecutionCapsSchema = z
  .object({
    maxDurationSeconds: z.number().int().min(1).max(SCOPE_HARD_CAPS.maxDurationSeconds),
    maxRequests: z.number().int().min(1).max(SCOPE_HARD_CAPS.maxRequests),
    maxConcurrency: z.number().int().min(1).max(SCOPE_HARD_CAPS.maxConcurrency),
    maxMemoryMb: z.number().int().min(64).max(SCOPE_HARD_CAPS.maxMemoryMb),
    maxCpuMillicores: z.number().int().min(100).max(SANDBOX_HARD_CAPS.maxCpuMillicores),
    maxPids: z.number().int().min(8).max(SANDBOX_HARD_CAPS.maxPids),
  })
  .strict();
export type OperatorExecutionCaps = Readonly<z.infer<typeof OperatorExecutionCapsSchema>>;

/** Strictest available posture — the H demo runtime ceiling. */
export const DEFAULT_OPERATOR_CAPS: OperatorExecutionCaps = deepFreeze({
  maxDurationSeconds: SANDBOX_HARD_CAPS.maxDurationSeconds,
  maxRequests: SANDBOX_HARD_CAPS.maxRequests,
  maxConcurrency: 1,
  maxMemoryMb: SANDBOX_HARD_CAPS.maxMemoryMb,
  maxCpuMillicores: SANDBOX_HARD_CAPS.maxCpuMillicores,
  maxPids: SANDBOX_HARD_CAPS.maxPids,
});

export function intersectExecutionBudget(
  scope: Pick<
    AuthorizationScope,
    "maxDurationSeconds" | "maxRequests" | "maxConcurrency" | "maxMemoryMb"
  >,
  operatorCaps: OperatorExecutionCaps,
  packId: TestPackId,
): EffectiveExecutionLimits {
  const pack = TEST_PACK_MANIFEST[packId];
  return deepFreeze(
    EffectiveExecutionLimitsSchema.parse({
      maxDurationSeconds: Math.min(
        operatorCaps.maxDurationSeconds,
        scope.maxDurationSeconds,
        pack.maxDurationSeconds,
        SANDBOX_HARD_CAPS.maxDurationSeconds,
      ),
      maxRequests: Math.min(
        operatorCaps.maxRequests,
        scope.maxRequests,
        pack.maxRequests,
        SANDBOX_HARD_CAPS.maxRequests,
      ),
      maxConcurrency: Math.min(operatorCaps.maxConcurrency, scope.maxConcurrency),
      maxMemoryMb: Math.min(
        operatorCaps.maxMemoryMb,
        scope.maxMemoryMb,
        SANDBOX_HARD_CAPS.maxMemoryMb,
      ),
      maxCpuMillicores: Math.min(operatorCaps.maxCpuMillicores, SANDBOX_HARD_CAPS.maxCpuMillicores),
      maxPids: Math.min(operatorCaps.maxPids, SANDBOX_HARD_CAPS.maxPids),
    }),
  ) as EffectiveExecutionLimits;
}

/**
 * Verify a *requested* budget (e.g. a plan-level or runner-level request)
 * fits inside the effective intersection. Any requested field exceeding the
 * effective value denies the whole request — model output may narrow, never
 * exceed.
 */
export function checkRequestedBudget(
  requested: Partial<Record<keyof EffectiveExecutionLimits, unknown>>,
  effective: EffectiveExecutionLimits,
): PolicyDenyReason[] {
  const reasons: PolicyDenyReason[] = [];
  for (const key of [
    "maxDurationSeconds",
    "maxRequests",
    "maxConcurrency",
    "maxMemoryMb",
    "maxCpuMillicores",
    "maxPids",
  ] as const) {
    const value = requested[key];
    if (value === undefined) continue;
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > effective[key]
    ) {
      reasons.push(
        denyReason(
          "budget_exceeded",
          `${key} ${JSON.stringify(value)} exceeds effective limit ${effective[key]}`,
        ),
      );
    }
  }
  return reasons;
}
