/** Real bindings for security (L04), inference (L12), test-packs (L15). */
import { evaluatePlanAuthorization } from "@highcastle/security";
import { VultrInferenceClient } from "@highcastle/inference";
import { adjudicateAttempt, adjudicateReplay } from "@highcastle/test-packs";
import {
  AuthorizationScopeSchema,
  EnvironmentSchema,
  ProjectSchema,
  TargetSchema,
} from "@highcastle/contracts";
import type { z } from "zod";
import type {
  AttemptObservations,
  AttemptVerifier,
  InferencePlanner,
  PlanAuthorizationRequest,
  PlanDecision,
  PolicyGate,
} from "./ports.js";

/**
 * Deep-convert Date instances to ISO strings. L02 returns Date-typed
 * timestamps; L04's contracts re-parse every input through Zod schemas
 * that require ISO 8601 strings — this is the honest boundary mapping,
 * not a field fabrication.
 */
function deepSerialize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(deepSerialize);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        deepSerialize(v),
      ]),
    );
  }
  return value;
}

/**
 * Map a persisted L02 row to its frozen contract shape: serialize Dates,
 * then keep ONLY the keys the contract schema declares (DB rows carry
 * extra columns — createdAt/updatedAt/signature — that `.strict()`
 * schemas correctly reject). Non-record input passes through so the
 * policy gate itself emits the malformed deny.
 */
function toContractRow(schema: z.ZodObject<z.ZodRawShape>, row: unknown): unknown {
  const serialized = deepSerialize(row);
  if (typeof serialized !== "object" || serialized === null) return serialized;
  const rec = serialized as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(schema.shape).map((k) => [k, rec[k]]),
  );
}

export function createSecurityPolicyGate(): PolicyGate {
  return {
    async authorizePlan(input: PlanAuthorizationRequest): Promise<PlanDecision> {
      const decision = evaluatePlanAuthorization({
        scope: toContractRow(AuthorizationScopeSchema, input.scope),
        project: toContractRow(ProjectSchema, input.project),
        target: toContractRow(TargetSchema, input.target),
        environment: toContractRow(EnvironmentSchema, input.environment),
        proposal: input.proposal,
        operatorCaps: input.operatorCaps,
        ...(input.now ? { now: input.now } : {}),
      });
      if (decision.decision === "allow") {
        const a = decision.approval;
        if (a.kind !== "execution") {
          return {
            allowed: false,
            policyVersion: decision.policyVersion,
            policyHash: decision.policyHash,
            reasons: [{ code: "unexpected_approval_kind", detail: a.kind }],
          };
        }
        return {
          allowed: true,
          policyVersion: decision.policyVersion,
          policyHash: decision.policyHash,
          packId: a.packId,
          packVersion: a.packVersion,
          targetServiceAlias: a.targetServiceAlias,
          permittedMethods: a.permittedMethods,
          limits: {
            maxDurationSeconds: a.limits.maxDurationSeconds,
            maxRequests: a.limits.maxRequests,
            maxMemoryMb: a.limits.maxMemoryMb,
            maxCpuMillicores: a.limits.maxCpuMillicores,
            maxPids: a.limits.maxPids,
          },
          expiresAt: new Date(a.expiresAt),
          reasons: [],
        };
      }
      return {
        allowed: false,
        policyVersion: decision.policyVersion,
        policyHash: decision.policyHash,
        reasons: decision.reasons.map((r) => ({ code: r.code, detail: r.detail })),
      };
    },
  };
}

export function createInferencePlanner(): InferencePlanner {
  const client = VultrInferenceClient.fromEnv();
  return {
    generateHypothesis: (input) => client.generateHypothesis(input),
  };
}

export function createAttemptVerifier(): AttemptVerifier {
  return {
    adjudicate: async (obs: AttemptObservations) =>
      adjudicateAttempt({
        attemptId: obs.attemptId,
        expectedRevision: obs.expectedRevision as never,
        health: obs.health,
        ready: obs.ready,
        meta: obs.meta,
        ownInvoice: obs.ownInvoice,
        crossInvoice: obs.crossInvoice,
      }),
    adjudicateReplay: async (patchedRun) => adjudicateReplay(patchedRun as never),
  };
}
