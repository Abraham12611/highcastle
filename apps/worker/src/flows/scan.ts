/**
 * `scan.plan_and_execute` — the durable scan state machine.
 *
 * The flow is written as a stage loop over the PERSISTED scan status, so an
 * at-least-once redelivery or a crashed worker resumes exactly at the stage
 * the row reached — never re-executes a completed one. Legal transitions
 * come from L02's `transitionScan` CAS (`04_RELATIONSHIPS_AND_STATES`):
 *
 *   queued → preparing → recon → planning → executing → verifying
 *     → finalizing → completed | partial | failed | canceled
 *
 * Guarantees:
 * - Scope re-checked at dispatch AND before the sandbox dispatch
 *   (revoked/expired/drifted scope fails the scan, never runs).
 * - Model output only ever *names* an approved pack; the deterministic
 *   policy gate (L04) decides, and the runner gets only the intersected plan.
 * - A confirmed finding exists only when the independent verifier's
 *   adjudication over recorded observations returns `reproduced`.
 * - Cancel is observed between every stage and aborts in-flight runners.
 */
import {
  CONTRACT_SCHEMA_VERSION,
  MAX_MODEL_REPLANS,
  isTerminalScanStatus,
  type ModelProposal,
  type Scan,
  type ScanStatus,
} from "@highcastle/contracts";
import { ScanStateConflictError } from "../adapters/errors.js";
import type { AttemptRecord, HypothesisInput, PlanDecision } from "../adapters/ports.js";
import type { OrchestratorDeps } from "./deps.js";
import { emit } from "./events.js";
import { runAttempt, type ApprovedPlan, type AttemptRunResult } from "./execute-attempt.js";

export interface ScanJobPayload {
  workspaceId: string;
  scanId: string;
}

export interface ScanJobResult {
  status: "completed" | "partial" | "failed" | "canceled" | "skipped";
  reason?: string;
}

/** Plan pinned by a replay instead of produced by inference. */
export interface PinnedPlan {
  packId: string;
  packVersion: string;
}

export interface ScanRunOptions {
  pinnedPlan?: PinnedPlan;
  signal?: AbortSignal;
}

/** Stages the worker may resume into (anything non-terminal, post-claim). */
const IN_FLIGHT: readonly ScanStatus[] = [
  "preparing",
  "recon",
  "planning",
  "executing",
  "verifying",
  "finalizing",
];

/** Failure codes persisted on the scan row (UI shows them verbatim). */
export const SCAN_FAILURE = {
  scopeInvalid: "scope_invalid",
  modelUnavailable: "model_unavailable",
  modelPlanInvalid: "model_plan_invalid",
  policyDenied: "policy_denied",
  controllerDenied: "controller_denied",
  sandboxPrecondition: "sandbox_precondition",
  attemptFailed: "attempt_failed",
} as const;

async function getScan(deps: OrchestratorDeps, p: ScanJobPayload): Promise<Scan> {
  const scan = await deps.store.getScan(p.workspaceId, p.scanId);
  if (!scan) throw new Error(`scan ${p.scanId} not found in workspace`);
  return scan;
}

async function isCancelRequested(deps: OrchestratorDeps, p: ScanJobPayload): Promise<boolean> {
  if (deps.cancelRegistry.isAborted(p.scanId)) return true;
  const fresh = await deps.store.getScan(p.workspaceId, p.scanId);
  return fresh?.cancelRequestedAt !== null && fresh?.cancelRequestedAt !== undefined;
}

/**
 * Verify the scan's authorization snapshot is still valid: scope exists,
 * is active + unexpired, and still names the same project/target/env.
 * This is the "re-check at dispatch and before every test" requirement.
 */
async function checkScopeStillValid(deps: OrchestratorDeps, scan: Scan): Promise<string | null> {
  const scope = await deps.store.getScope(scan.workspaceId, scan.scopeId);
  if (!scope) return "authorization scope not found";
  if (scope.status !== "active") return `authorization scope is ${scope.status}`;
  if (new Date(scope.expiresAt).getTime() <= deps.clock.now().getTime()) {
    return "authorization scope has expired";
  }
  if (scope.projectId !== scan.projectId || scope.targetId !== scan.targetId) {
    return "scope no longer covers this project/target";
  }
  if (scan.environmentId && scope.permittedEnvironmentId !== scan.environmentId) {
    return "scope does not permit this environment";
  }
  return null;
}

function buildHypothesisInput(scan: Scan, opts: ScanRunOptions): HypothesisInput {
  const packId = opts.pinnedPlan?.packId ?? scan.testPackIds[0] ?? "bola-invoice-v1";
  return {
    sanitizedSourceContext:
      "Synthetic invoice SaaS lab. Route under test: GET /api/invoices/:id " +
      "returns the invoice record for the authenticated tenant. Ownership " +
      "check presence is unknown; tenants alice (user_A) and bob (user_B) " +
      "each own one fixture invoice.",
    scopeSummary:
      `Approved packs: ${scan.testPackIds.join(", ")}; actor alice; ` +
      `target revision ${scan.targetRevision}; GET-only bounded requests.`,
    routeSummary: "GET /api/invoices/:id",
    packVersion: opts.pinnedPlan?.packVersion ?? "1.0.0",
    ...(packId ? {} : {}),
  };
}

/**
 * Synthesize a contract-valid proposal for a pinned replay plan. Policy
 * still validates it through `ModelProposalSchema` — a replay cannot smuggle
 * anything a model proposal could not.
 */
export function pinnedPlanProposal(pinned: PinnedPlan): ModelProposal {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    hypothesis: {
      category: "broken_object_authorization",
      targetComponent: "invoice_lookup",
      reason: "Replay of a previously confirmed attempt against a patched revision.",
      expectedSecureBehavior:
        "Cross-account invoice read is denied while the owner's read still works.",
    },
    requestedTest: {
      packId: pinned.packId as ModelProposal["requestedTest"]["packId"],
      objective: `Replay pinned pack ${pinned.packId}@${pinned.packVersion} on the patched revision.`,
    },
  };
}

interface PlanningResult {
  approval: ApprovedPlan;
  proposalId: string | null;
}

async function obtainApproval(
  deps: OrchestratorDeps,
  scan: Scan,
  opts: ScanRunOptions,
): Promise<PlanningResult | ScanJobResult> {
  const { workspaceId } = scan;
  const scope = await deps.store.getScope(workspaceId, scan.scopeId);
  const [project, target, environment] = await Promise.all([
    deps.store.getProject(workspaceId, scan.projectId),
    deps.store.getTarget(workspaceId, scan.targetId),
    deps.store.getEnvironment(workspaceId, scan.environmentId),
  ]);

  let proposal: ModelProposal;
  let proposalId: string | null = null;

  if (opts.pinnedPlan) {
    proposal = pinnedPlanProposal(opts.pinnedPlan);
  } else {
    // Resume: reuse the latest VALID proposal if a crashed run already
    // produced one — model calls are not free and replans are bounded.
    const existing = await deps.store.findLatestProposal(workspaceId, scan.id);
    if (existing && existing.validationStatus === "valid" && existing.structuredPlan) {
      proposal = existing.structuredPlan;
      proposalId = existing.id;
    } else {
      const outcome = await runInferenceUntilValid(deps, scan, opts);
      if (outcome === null) return { status: "failed", reason: "model_plan_invalid" };
      proposal = outcome.proposal;
      proposalId = outcome.proposalId;
    }
  }

  const decision: PlanDecision = await deps.policy.authorizePlan({
    scope,
    project,
    target,
    environment,
    proposal,
    now: deps.clock.now(),
  });

  if (!decision.allowed) {
    await failScan(deps, scan, SCAN_FAILURE.policyDenied, "policy", {
      safeSummary: `plan denied: ${decision.reasons.map((r) => r.code).join(", ")}`,
      payload: { denyCodes: decision.reasons.map((r) => r.code) },
    });
    return { status: "failed", reason: "policy_denied" };
  }

  await emit(deps, {
    workspaceId,
    scanId: scan.id,
    eventType: "test.plan.validated",
    phase: "planning",
    actorType: "policy",
    safeSummary: `plan approved for ${decision.packId}@${decision.packVersion}`,
    payloadRedacted: { policyHash: decision.policyHash, policyVersion: decision.policyVersion },
  });

  return { approval: decision, proposalId };
}

async function runInferenceUntilValid(
  deps: OrchestratorDeps,
  scan: Scan,
  opts: ScanRunOptions,
): Promise<{ proposal: ModelProposal; proposalId: string } | null> {
  const { workspaceId } = scan;
  const maxCalls = deps.config.maxModelReplans + 1; // total calls, incl. first
  const input = buildHypothesisInput(scan, opts);
  let lastIssues: string[] = [];

  for (let callIndex = 0; callIndex < maxCalls; callIndex++) {
    let outcome;
    try {
      outcome = await deps.inference.generateHypothesis(input);
    } catch (err) {
      // Transport/provider failure — retryable at job level, not silently.
      throw new Error(`inference call failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    const modelCall = await deps.store.recordModelCall({
      workspaceId,
      scanId: scan.id,
      provider: "vultr",
      model: outcome.metadata.model,
      purpose: "hypothesis",
      requestId: outcome.metadata.requestId,
      tokensInput: outcome.metadata.tokensInput,
      tokensOutput: outcome.metadata.tokensOutput,
      latencyMs: outcome.metadata.latencyMs,
      outcome: outcome.metadata.outcome,
      errorCode: outcome.metadata.errorCode,
      createdAt: deps.clock.now().toISOString(),
    });

    const agentProposal = await deps.store.recordAgentProposal({
      workspaceId,
      scanId: scan.id,
      modelCallId: modelCall.id,
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      rawProposalRedacted: outcome.rawProposalRedacted,
      structuredPlan: outcome.proposal,
      validationStatus: outcome.validationStatus,
      rejectionCode: outcome.rejectionCode,
      policyHash: null,
      createdAt: deps.clock.now().toISOString(),
    });

    if (outcome.validationStatus === "valid" && outcome.proposal) {
      return { proposal: outcome.proposal, proposalId: agentProposal.id };
    }
    lastIssues = outcome.issues;
  }

  await failScan(deps, scan, SCAN_FAILURE.modelPlanInvalid, "model", {
    safeSummary: `model proposal invalid after ${maxCalls} call(s)`,
    payload: { issues: lastIssues.slice(0, 8) },
  });
  return null;
}

async function failScan(
  deps: OrchestratorDeps,
  scan: Scan,
  failureCode: string,
  actor: "worker" | "policy" | "model" | "runner" | "system",
  detail: { safeSummary: string; payload?: Record<string, unknown> },
): Promise<void> {
  try {
    await deps.store.transitionScan(scan.workspaceId, scan.id, {
      to: "failed",
      failureCode,
    });
  } catch (err) {
    // Terminal or concurrently finalized — the failure is already recorded.
    if (!(err instanceof ScanStateConflictError)) throw err;
  }
  await emit(deps, {
    workspaceId: scan.workspaceId,
    scanId: scan.id,
    eventType: "scan.failed",
    phase: null,
    actorType: actor,
    safeSummary: detail.safeSummary,
    payloadRedacted: { failureCode, ...detail.payload },
  });
}

async function cancelScan(deps: OrchestratorDeps, scan: Scan): Promise<ScanJobResult> {
  deps.cancelRegistry.abort(scan.id);
  const runnerIds = await deps.store.listActiveRunnerIds(scan.workspaceId, scan.id);
  for (const runnerId of runnerIds) {
    try {
      await deps.sandbox.cancel(runnerId, "scan_canceled");
    } catch {
      // Best-effort kill; the janitor reconciles anything missed.
    }
  }
  try {
    await deps.store.transitionScan(scan.workspaceId, scan.id, { to: "canceled" });
  } catch (err) {
    if (!(err instanceof ScanStateConflictError)) throw err;
  }
  await emit(deps, {
    workspaceId: scan.workspaceId,
    scanId: scan.id,
    eventType: "scan.canceled",
    phase: null,
    actorType: "worker",
    safeSummary: "scan canceled; runners terminated",
  });
  deps.cancelRegistry.release(scan.id);
  return { status: "canceled" };
}

/** Find the attempt written by this flow's executing stage. */
async function latestAttempt(deps: OrchestratorDeps, scan: Scan): Promise<AttemptRecord | null> {
  const attempts = await deps.store.listAttempts(scan.workspaceId, scan.id);
  return attempts.sort((a, b) => b.attemptNumber - a.attemptNumber)[0] ?? null;
}

/**
 * Drive one scan to a terminal state. Resumable by construction: every
 * iteration reads the persisted status and executes ONLY that stage's work.
 */
export async function executeScanJob(
  deps: OrchestratorDeps,
  payload: ScanJobPayload,
  opts: ScanRunOptions = {},
): Promise<ScanJobResult> {
  const { workspaceId, scanId } = payload;
  const initial = await deps.store.getScan(workspaceId, scanId);
  if (!initial) throw new Error(`scan ${scanId} not found in workspace`);

  if (isTerminalScanStatus(initial.status)) {
    return { status: "skipped", reason: `already ${initial.status}` };
  }

  if (initial.status === "queued") {
    // Claim: CAS queued -> preparing. A second delivery loses the race.
    try {
      await deps.store.transitionScan(workspaceId, scanId, {
        to: "preparing",
        phase: "preparing",
      });
    } catch (err) {
      if (err instanceof ScanStateConflictError) {
        return { status: "skipped", reason: "claimed by another delivery" };
      }
      throw err;
    }
    await emit(deps, {
      workspaceId,
      scanId,
      eventType: "scan.started",
      phase: "preparing",
      actorType: "worker",
      safeSummary: "worker claimed scan; orchestration starting",
    });
  } else if (!IN_FLIGHT.includes(initial.status)) {
    // draft/preflight/awaiting_approval are API-side states, not job work.
    return { status: "skipped", reason: `status ${initial.status} is not dispatchable` };
  }

  const signal = opts.signal ?? deps.cancelRegistry.register(scanId).signal;
  // Planning output cached for this invocation only; a resumed run
  // re-derives it from the persisted proposal + a fresh policy eval.
  let cachedPlan: PlanningResult | null = null;

  // Defensive bound: the stage loop must always make progress; a broken
  // transition table surfaces as an exception, not a hot loop.
  for (let guard = 0; guard < 32; guard++) {
    const scan = await getScan(deps, payload);

    if (isTerminalScanStatus(scan.status)) {
      deps.cancelRegistry.release(scanId);
      return { status: scan.status as ScanJobResult["status"] };
    }
    if (signal.aborted || (await isCancelRequested(deps, payload))) {
      return cancelScan(deps, scan);
    }

    switch (scan.status) {
      case "preparing": {
        const invalid = await checkScopeStillValid(deps, scan);
        if (invalid) {
          await failScan(deps, scan, SCAN_FAILURE.scopeInvalid, "policy", {
            safeSummary: `dispatch precheck failed: ${invalid}`,
          });
          return { status: "failed", reason: invalid };
        }
        await deps.store.transitionScan(workspaceId, scanId, {
          to: "recon",
          phase: "recon",
        });
        await emit(deps, {
          workspaceId,
          scanId,
          eventType: "scan.stage.updated",
          phase: "recon",
          actorType: "worker",
          safeSummary: "authorization snapshot re-validated; building test context",
        });
        break;
      }

      case "recon": {
        // H recon is deterministic context assembly (the lab is fixed);
        // network/source recon belongs to post-H packs.
        await deps.store.transitionScan(workspaceId, scanId, {
          to: "planning",
          phase: "planning",
        });
        await emit(deps, {
          workspaceId,
          scanId,
          eventType: "scan.stage.updated",
          phase: "planning",
          actorType: "worker",
          safeSummary: "context assembled; requesting structured plan",
        });
        break;
      }

      case "planning": {
        const planned = await obtainApproval(deps, scan, opts);
        if ("status" in planned) return planned;
        cachedPlan = planned;
        await deps.store.transitionScan(workspaceId, scanId, {
          to: "executing",
          phase: "executing",
          plannedCount: 1,
        });
        break;
      }

      case "executing": {
        // Resume path re-derives the approval from the persisted proposal +
        // a fresh deterministic policy eval (cachedPlan is null then).
        const planned: PlanningResult | ScanJobResult =
          cachedPlan ?? (await obtainApproval(deps, scan, opts));
        if ("status" in planned) return planned;
        cachedPlan = planned;

        // Scope re-check immediately before dispatch (per-issue).
        const [invalid, scope] = await Promise.all([
          checkScopeStillValid(deps, scan),
          deps.store.getScope(workspaceId, scan.scopeId),
        ]);
        if (invalid || !scope) {
          await failScan(deps, scan, SCAN_FAILURE.scopeInvalid, "policy", {
            safeSummary: `pre-dispatch scope re-check failed: ${invalid ?? "scope missing"}`,
          });
          return { status: "failed", reason: invalid ?? "scope missing" };
        }

        const run: AttemptRunResult = await runAttempt(deps, {
          workspaceId,
          scanId,
          approval: planned.approval,
          proposalId: planned.proposalId,
          scopeHash: scope.scopeHash,
          targetRevision: scan.targetRevision,
          attemptNumber: 1,
          signal,
        });

        if (run.outcome === "blocked") {
          await failScan(deps, scan, SCAN_FAILURE.controllerDenied, "policy", {
            safeSummary: "sandbox controller denied the approved request",
          });
          return { status: "failed", reason: "controller_denied" };
        }
        if (run.outcome === "precondition_failed") {
          await failScan(deps, scan, SCAN_FAILURE.sandboxPrecondition, "runner", {
            safeSummary: "sandbox could not start within policy preconditions",
          });
          return { status: "failed", reason: "sandbox_precondition" };
        }
        if (run.outcome === "timeout" || run.outcome === "failed") {
          await deps.store.transitionScan(workspaceId, scanId, {
            to: "verifying",
            phase: "verifying",
            executedCount: 1,
          });
          break; // partial in finalize — evidence honestly incomplete
        }
        await deps.store.transitionScan(workspaceId, scanId, {
          to: "verifying",
          phase: "verifying",
          executedCount: 1,
        });
        break;
      }

      case "verifying": {
        const attempt = await latestAttempt(deps, scan);
        if (
          attempt &&
          attempt.verifierVerdict === "reproduced" &&
          attempt.positiveControlPassed === true
        ) {
          const { finding, created } = await deps.store.upsertFindingFromVerdict({
            workspaceId,
            projectId: scan.projectId,
            stableFingerprint: "bola:invoice_lookup:owner_check",
            title: "Cross-account invoice readable (BOLA)",
            summary:
              "The invoice endpoint returned another tenant's invoice to a " +
              "different authenticated fixture user; independent oracle " +
              `adjudicated reproduced (oracle ${attempt.oracleVersion ?? "unknown"}).`,
            category: "broken_object_authorization",
            severity: "high",
            confidence: "confirmed_by_execution",
            scanId: scan.id,
            attemptId: attempt.id,
            sourceRevision: scan.sourceSnapshotRef,
            targetRevision: scan.targetRevision,
            oracleVerdict: "reproduced",
          });
          await emit(deps, {
            workspaceId,
            scanId,
            eventType: "finding.confirmed",
            phase: "verifying",
            actorType: "oracle",
            safeSummary: created
              ? "confirmed BOLA finding recorded from executed evidence"
              : "existing BOLA finding re-confirmed by executed evidence",
            payloadRedacted: { findingId: finding.id },
            attemptId: attempt.id,
          });
          await deps.store.transitionScan(workspaceId, scanId, {
            to: "finalizing",
            phase: "finalizing",
            confirmedCount: 1,
          });
        } else {
          await deps.store.transitionScan(workspaceId, scanId, {
            to: "finalizing",
            phase: "finalizing",
            confirmedCount: 0,
          });
        }
        break;
      }

      case "finalizing": {
        const attempt = await latestAttempt(deps, scan);
        const terminal =
          !attempt || attempt.status === "timeout" || attempt.status === "failed"
            ? "partial"
            : "completed";
        await deps.store.transitionScan(workspaceId, scanId, {
          to: terminal,
          executedCount: attempt ? 1 : 0,
        });
        await emit(deps, {
          workspaceId,
          scanId,
          eventType: terminal === "completed" ? "scan.completed" : "scan.failed",
          phase: null,
          actorType: "worker",
          safeSummary:
            terminal === "completed"
              ? `scan completed; verdict ${attempt?.verifierVerdict ?? "none"}`
              : "scan finished partial: attempt did not produce a complete verdict",
          payloadRedacted: {
            verdict: attempt?.verifierVerdict ?? null,
            attemptStatus: attempt?.status ?? null,
          },
        });
        deps.cancelRegistry.release(scanId);
        return { status: terminal };
      }

      default:
        throw new Error(`unreachable scan status in worker: ${scan.status}`);
    }
  }
  throw new Error(`scan ${scanId} stage loop exceeded guard bound`);
}

/** Total replan budget re-exported for callers (contracts is source of truth). */
export { MAX_MODEL_REPLANS };
