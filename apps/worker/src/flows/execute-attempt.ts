/**
 * Shared attempt pipeline — one approved test pack, one sandboxed run,
 * one independent verdict. Used identically by scan and replay flows.
 *
 * Evidence rules enforced here (non-negotiable):
 * - The runner's own assertion booleans NEVER create a finding. Only the
 *   trusted verifier (L15) adjudicating parsed observations can produce
 *   `reproduced`, which is the sole `confirmed_by_execution` input.
 * - If the runner produced no observation channel, the attempt is
 *   inconclusive by construction — not a vulnerability, not a success.
 * - Every runtime containment event the controller reports is persisted
 *   verbatim; we never mint one ourselves.
 */
import { createHash, randomBytes } from "node:crypto";
import {
  CONTRACT_SCHEMA_VERSION,
  SandboxRequestSchema,
  TEST_PACK_MANIFEST,
  TestPackIdSchema,
  type SandboxRequest,
} from "@highcastle/contracts";
import type { OrchestratorDeps } from "./deps.js";
import type { AttemptAdjudication, AttemptRecord, PlanDecision } from "../adapters/ports.js";
import { emit } from "./events.js";

export type ApprovedPlan = Extract<PlanDecision, { allowed: true }>;

export interface AttemptRunInput {
  workspaceId: string;
  scanId: string;
  approval: ApprovedPlan;
  proposalId: string | null;
  scopeHash: string;
  targetRevision: string;
  attemptNumber: number;
  signal?: AbortSignal;
}

export type AttemptRunOutcome =
  "completed" | "timeout" | "failed" | "canceled" | "blocked" | "precondition_failed";

export interface AttemptRunResult {
  attempt: AttemptRecord;
  outcome: AttemptRunOutcome;
  adjudication: AttemptAdjudication | null;
  /** True only when the trusted verifier returned `reproduced`. */
  reproduced: boolean;
}

/** Deterministic plan hash for idempotent attempt rows (resume-safe). */
export function computePlanHash(parts: {
  scanId: string;
  packId: string;
  packVersion: string;
  proposalId: string | null;
  scopeHash: string;
  targetRevision: string;
}): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function newNonce(): string {
  return randomBytes(24).toString("hex");
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Opaque actor credential ref — the value never leaves the controller. */
export function actorCredentialRef(role: "alice" | "bob"): string {
  return `ref:synthetic:${role}`;
}

/**
 * Execute one approved attempt end to end. Never throws for expected
 * outcomes (deny/timeout/kill); only infrastructure failures propagate.
 */
export async function runAttempt(
  deps: OrchestratorDeps,
  input: AttemptRunInput,
): Promise<AttemptRunResult> {
  const { store, sandbox, verifier, config } = deps;
  const { workspaceId, scanId, approval, attemptNumber } = input;

  const packId = TestPackIdSchema.parse(approval.packId);
  const manifest = TEST_PACK_MANIFEST[packId];

  const planHash = computePlanHash({
    scanId,
    packId,
    packVersion: approval.packVersion,
    proposalId: input.proposalId,
    scopeHash: input.scopeHash,
    targetRevision: input.targetRevision,
  });

  // Idempotent attempt row — a redelivered job reuses the existing row
  // instead of double-executing under a new ID.
  const attempt =
    (await store.findAttemptByPlanHash(workspaceId, scanId, planHash)) ??
    (await store.createAttempt({
      workspaceId,
      scanId,
      packId,
      packVersion: approval.packVersion,
      proposalId: input.proposalId,
      planHash,
      scopeHash: input.scopeHash,
      targetRevision: input.targetRevision,
      attemptNumber,
    }));

  if (
    attempt.status === "completed" ||
    attempt.status === "timeout" ||
    attempt.status === "failed" ||
    attempt.status === "canceled" ||
    attempt.status === "blocked"
  ) {
    // Resume: a prior delivery already finished this attempt.
    return {
      attempt,
      outcome: attempt.status === "blocked" ? "blocked" : attempt.status,
      adjudication: null,
      reproduced: false,
    };
  }

  const request: SandboxRequest = SandboxRequestSchema.parse({
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    scanId,
    attemptId: attempt.id,
    policyHash: approval.policyHash,
    packId,
    packVersion: approval.packVersion,
    targetServiceAlias: approval.targetServiceAlias,
    actorCredentialRef: actorCredentialRef("alice"),
    nonce: newNonce(),
    permittedMethods: [...manifest.permittedMethods],
    limits: {
      maxDurationSeconds: Math.min(approval.limits.maxDurationSeconds, manifest.maxDurationSeconds),
      maxRequests: Math.min(approval.limits.maxRequests, manifest.maxRequests),
      maxMemoryMb: approval.limits.maxMemoryMb,
      maxCpuMillicores: approval.limits.maxCpuMillicores,
      maxPids: approval.limits.maxPids,
    },
    targetImageDigest: config.targetImageDigest,
  });

  await store.updateAttemptStatus(workspaceId, attempt.id, "running");
  const run = await sandbox.execute(request, {
    workspaceId,
    signal: input.signal,
  });

  if (run.kind === "denied") {
    const updated = await store.updateAttemptStatus(workspaceId, attempt.id, "blocked");
    await emit(deps, {
      workspaceId,
      scanId,
      eventType: "sandbox.action_blocked",
      phase: "executing",
      actorType: "policy",
      safeSummary: `controller denied attempt launch: ${run.reason}`,
      payloadRedacted: { policyVersion: run.policyVersion },
      attemptId: attempt.id,
    });
    return { attempt: updated, outcome: "blocked", adjudication: null, reproduced: false };
  }

  if (run.kind === "precondition_failed") {
    const updated = await store.updateAttemptStatus(workspaceId, attempt.id, "failed");
    await emit(deps, {
      workspaceId,
      scanId,
      eventType: "scan.stage.updated",
      phase: "executing",
      actorType: "runner",
      safeSummary: `sandbox precondition failed: ${run.reason}`,
      attemptId: attempt.id,
    });
    return {
      attempt: updated,
      outcome: "precondition_failed",
      adjudication: null,
      reproduced: false,
    };
  }

  // --- executed: persist observed facts BEFORE any verdict --------------
  for (const containment of run.containmentEvents) {
    await store.recordContainmentEvent(containment);
    await emit(deps, {
      workspaceId,
      scanId,
      eventType: "sandbox.action_blocked",
      phase: "executing",
      actorType: "runner",
      safeSummary: containment.safeSummary,
      payloadRedacted: { ruleId: containment.ruleId, runnerId: containment.runnerId },
      attemptId: attempt.id,
    });
  }

  const terminalStatus =
    run.outcome === "completed"
      ? ("completed" as const)
      : run.outcome === "timeout"
        ? ("timeout" as const)
        : ("failed" as const);

  if (run.outcome !== "completed") {
    const updated = await store.updateAttemptStatus(
      workspaceId,
      attempt.id,
      run.outcome === "timeout" ? "timeout" : "failed",
    );
    await emit(deps, {
      workspaceId,
      scanId,
      eventType: "scan.stage.updated",
      phase: "executing",
      actorType: "runner",
      safeSummary: `runner finished with outcome ${run.outcome}`,
      attemptId: attempt.id,
    });
    return { attempt: updated, outcome: terminalStatus, adjudication: null, reproduced: false };
  }

  await emit(deps, {
    workspaceId,
    scanId,
    eventType: "test.executed",
    phase: "executing",
    actorType: "runner",
    safeSummary: "attempt executed; observations handed to the independent verifier",
    attemptId: attempt.id,
  });

  // --- independent verification (L15 port) ------------------------------
  if (run.observations === null) {
    // The runner ran but could not hand parsed observations to the oracle —
    // see AttemptObservations contract-gap note. Honest inconclusive.
    const adjudication: AttemptAdjudication = {
      attemptId: attempt.id,
      oracleVersion: "unavailable",
      baseline: "unknown",
      securityCheck: "unknown",
      verdict: "inconclusive",
      preconditionsOk: false,
      reasons: [
        "observation_channel_unavailable: runner returned no parsed observations; runner booleans are not verdict input",
      ],
    };
    const updated = await store.recordAttemptVerdict(workspaceId, attempt.id, {
      oracleVersion: adjudication.oracleVersion,
      verdict: "inconclusive",
      reasonCode: "observation_channel_unavailable",
      positiveControlPassed: null,
      negativeSecurityConditionMet: null,
    });
    return { attempt: updated, outcome: "completed", adjudication, reproduced: false };
  }

  const adjudication = await verifier.adjudicate(run.observations);
  const updatedAttempt = await store.recordAttemptVerdict(workspaceId, attempt.id, {
    oracleVersion: adjudication.oracleVersion,
    verdict: adjudication.verdict,
    reasonCode: adjudication.reasons.join(" | ").slice(0, 128),
    positiveControlPassed: adjudication.baseline === "pass",
    negativeSecurityConditionMet: adjudication.securityCheck === "pass",
  });

  // Persist the verdict payload as a redacted oracle artifact (hash pinned).
  await store.createEvidenceArtifact({
    workspaceId,
    scanId,
    attemptId: attempt.id,
    artifactKind: "oracle",
    storageKind: "db",
    storageKey: `oracle/${attempt.id}/${sha256Hex(JSON.stringify(adjudication.reasons)).slice(0, 24)}`,
    sha256: sha256Hex(JSON.stringify(adjudication)),
    byteSize: JSON.stringify(adjudication).length,
    contentType: "application/json",
  });

  return {
    attempt: updatedAttempt,
    outcome: "completed",
    adjudication,
    reproduced: adjudication.verdict === "reproduced",
  };
}
