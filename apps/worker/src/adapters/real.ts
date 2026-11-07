/** Real bindings for security (L04), inference (L12), test-packs (L15). */
import { evaluatePlanAuthorization } from "@highcastle/security";
import { VultrInferenceClient } from "@highcastle/inference";
import { adjudicateAttempt, adjudicateReplay } from "@highcastle/test-packs";
import type {
  AttemptObservations,
  AttemptVerifier,
  InferencePlanner,
  PlanAuthorizationRequest,
  PlanDecision,
  PolicyGate,
} from "./ports.js";

export function createSecurityPolicyGate(): PolicyGate {
  return {
    async authorizePlan(input: PlanAuthorizationRequest): Promise<PlanDecision> {
      const decision = evaluatePlanAuthorization({
        scope: input.scope,
        project: input.project,
        target: input.target,
        environment: input.environment,
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
