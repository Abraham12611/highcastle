import {
  ExplanationClient,
  type ExplanationPromptInput,
  type ExplanationResult,
} from "@highcastle/inference";
import type { OracleVerdict } from "@highcastle/contracts";
import type { AttemptAdjudication } from "../adapters/ports.js";
import type {
  EvidenceArtifactRef,
  OrchestratorStore,
  RecordExplanationInput,
  ScanEventPublisher,
} from "../adapters/ports.js";

/**
 * Post-oracle explanation service (Engineer 8).
 *
 * Runs AFTER the independent oracle verdict is persisted. Builds the
 * explanation input from trusted, redacted observations (adjudication
 * reasons) and ACTUAL persisted evidence artifact IDs — never raw bodies,
 * never caller-supplied IDs. The model is advisory only: its output is
 * validated (verdict echo, attempt echo, approved-evidence subset,
 * substitution check) and anything else is rejected without persistence.
 *
 * Fail-safe contract: this service NEVER throws for model, validation,
 * or persistence problems — it returns `failed`/`skipped` and emits an
 * audit event. The attempt outcome, scan success, and oracle verdict are
 * fixed before this runs and cannot be changed here.
 */

export interface ExplainAttemptInput {
  workspaceId: string;
  scanId: string;
  attemptId: string;
  packId: string;
  packVersion: string;
  targetRevision: string;
  oracleVerdict: OracleVerdict;
  adjudication: AttemptAdjudication;
}

export interface ExplanationClientLike {
  generateExplanation(input: unknown): Promise<ExplanationResult>;
}

export interface ExplainAttemptDeps {
  store: Pick<OrchestratorStore, "listEvidenceForAttempt" | "recordExplanation">;
  events: ScanEventPublisher;
  /** Injectable for tests; defaults to the server-configured Vultr client. */
  inference?: ExplanationClientLike;
}

export type ExplainAttemptStatus = "explained" | "skipped" | "failed";

export interface ExplainAttemptResult {
  status: ExplainAttemptStatus;
  /** Present only when a validated explanation was persisted. */
  explanationId?: string;
  /** Machine-readable cause for skipped/failed outcomes. */
  reasonCode?: string;
}

const MAX_SUMMARIES = 8;
const MAX_SUMMARY_CHARS = 500;

function buildObservationSummaries(adjudication: AttemptAdjudication): string[] {
  const reasons: unknown[] = Array.isArray(adjudication.reasons) ? adjudication.reasons : [];
  return reasons
    .filter((r): r is string => typeof r === "string" && r.length > 0)
    .slice(0, MAX_SUMMARIES)
    .map((r) => (r.length > MAX_SUMMARY_CHARS ? `${r.slice(0, MAX_SUMMARY_CHARS)}…` : r));
}

function buildEvidenceRefs(rows: EvidenceArtifactRef[]): ExplanationPromptInput["evidenceRefs"] {
  return rows.slice(0, MAX_SUMMARIES).map((row) => ({
    evidenceId: row.id,
    artifactKind: row.artifactKind,
    sha256: row.sha256,
    // No excerpts are stored — cite identity + digest + kind only.
    byteSummary: `redacted ${row.artifactKind} artifact, sha256 ${row.sha256.slice(0, 16)}…`,
  }));
}

function resolveClient(explicit: ExplanationClientLike | undefined): ExplanationClientLike | null {
  if (explicit) return explicit;
  try {
    return ExplanationClient.fromEnv(process.env);
  } catch {
    return null;
  }
}

export async function runPostOracleExplanation(
  deps: ExplainAttemptDeps,
  input: ExplainAttemptInput,
): Promise<ExplainAttemptResult> {
  const baseEvent = {
    workspaceId: input.workspaceId,
    scanId: input.scanId,
    attemptId: input.attemptId,
  } as const;
  try {
    if (input.packId !== "bola-invoice-v1") {
      return { status: "skipped", reasonCode: "unsupported_pack" };
    }
    const client = resolveClient(deps.inference);
    if (client === null) {
      await deps.events.publish({
        ...baseEvent,
        eventType: "scan.stage.updated",
        phase: "verifying",
        actorType: "oracle",
        safeSummary: "explanation skipped: inference is not configured",
      });
      return { status: "skipped", reasonCode: "inference_unavailable" };
    }

    const rows = await deps.store.listEvidenceForAttempt(
      input.workspaceId,
      input.scanId,
      input.attemptId,
    );
    const owned = rows.filter(
      (row) =>
        row.workspaceId === input.workspaceId &&
        row.scanId === input.scanId &&
        row.attemptId === input.attemptId,
    );
    const observationSummaries = buildObservationSummaries(input.adjudication);
    if (owned.length === 0 || observationSummaries.length === 0) {
      await deps.events.publish({
        ...baseEvent,
        eventType: "scan.stage.updated",
        phase: "verifying",
        actorType: "oracle",
        safeSummary: "explanation skipped: no persisted evidence to ground it",
      });
      return { status: "skipped", reasonCode: "missing_evidence" };
    }

    const prompt: ExplanationPromptInput = {
      attemptId: input.attemptId,
      packId: "bola-invoice-v1",
      packVersion: input.packVersion,
      targetRevision: input.targetRevision,
      oracleVerdict: input.oracleVerdict,
      replayVerdict: null,
      positiveControlPassed: input.adjudication.baseline === "pass" ? true : input.adjudication.baseline === "fail" ? false : null,
      negativeSecurityConditionMet:
        input.adjudication.securityCheck === "pass" ? true : input.adjudication.securityCheck === "fail" ? false : null,
      observationSummaries,
      evidenceRefs: buildEvidenceRefs(owned),
    };
    const result = await client.generateExplanation(prompt);
    if (result.validationStatus !== "valid" || result.explanation === null) {
      await deps.events.publish({
        ...baseEvent,
        eventType: "scan.stage.updated",
        phase: "verifying",
        actorType: "oracle",
        safeSummary: `explanation unavailable: model output rejected (${result.rejectionCode ?? "unknown"})`,
        payloadRedacted: { rejectionCode: result.rejectionCode ?? "unknown" },
      });
      return { status: "failed", reasonCode: result.rejectionCode ?? "invalid_explanation" };
    }

    const recordInput: RecordExplanationInput = {
      workspaceId: input.workspaceId,
      scanId: input.scanId,
      attemptId: input.attemptId,
      evidenceIds: owned.map((row) => row.id),
      requestedModel: result.metadata.model,
      responseModel: result.metadata.responseModel,
      requestId: result.metadata.requestId,
      latencyMs: result.metadata.latencyMs,
      tokensInput: result.metadata.tokensInput,
      tokensOutput: result.metadata.tokensOutput,
      outcome: "success",
      errorCode: null,
      oracleVerdict: input.oracleVerdict,
      replayVerdict: null,
      explanation: result.explanation,
      rawExplanationRedacted: result.rawExplanationRedacted,
    };
    const stored = await deps.store.recordExplanation(recordInput);
    await deps.events.publish({
      ...baseEvent,
      eventType: "scan.stage.updated",
      phase: "verifying",
      actorType: "oracle",
      safeSummary: `explanation stored for attempt ${input.attemptId} (verdict ${input.oracleVerdict} unchanged)`,
      payloadRedacted: { requestId: result.metadata.requestId ?? "none" },
    });
    return { status: "explained", explanationId: stored.id };
  } catch (error) {
    // Fail-safe: persistence or event errors must not change the attempt
    // outcome, scan success, or the persisted oracle verdict.
    await deps.events
      .publish({
        ...baseEvent,
        eventType: "scan.stage.updated",
        phase: "verifying",
        actorType: "oracle",
        safeSummary: `explanation unavailable: ${error instanceof Error ? error.message.slice(0, 120) : "unexpected failure"}`,
      })
      .catch(() => undefined);
    return { status: "failed", reasonCode: "explanation_error" };
  }
}
