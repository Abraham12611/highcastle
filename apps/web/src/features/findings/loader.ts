/**
 * Server-side loaders for findings/replays pages (L10).
 *
 * Live path talks to Engineer 2's BFF partial projections (see
 * `e2-client.ts`): finding row → occurrences → stored attempt →
 * evidence metadata, plus fix-prompt and current scope. Every hop maps
 * failures to explicit `LoadState`s; absent fields stay absent.
 * `fetchImpl` is injectable so the integration test observes the same
 * mapping against E2's actual response format without a network.
 */

import { headers } from "next/headers";
import { getFixPrompt, type FetchImpl } from "./api-client";
import {
  getE2Attempt,
  getE2Explanation,
  getE2Finding,
  getE2Scope,
  listE2Findings,
  listE2Occurrences,
} from "./e2-client";
import {
  DEMO_FINDING_ID,
  demoFindingDetail,
  demoFindingSummary,
} from "./demo";
import type {
  FindingDetail,
  FindingSummary,
  LoadState,
  ReplayDefaults,
  StoredAttempt,
  StoredExplanation,
} from "./types";

async function apiBaseUrl(): Promise<string> {
  const incoming = await headers();
  const host = incoming.get("host") ?? "localhost:3000";
  const proto = incoming.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

function toSummary(row: {
  id: string;
  title: string;
  category: FindingDetail["finding"]["category"];
  severity: FindingDetail["finding"]["severity"];
  confidence: FindingDetail["finding"]["confidence"];
  remediationStatus: FindingDetail["finding"]["remediationStatus"];
  firstSeenAt: string;
  lastSeenAt: string;
}): FindingSummary {
  return { ...row };
}

export async function loadFindingList(
  projectId: string,
  fetchImpl: FetchImpl = fetch,
  baseUrl?: string,
): Promise<LoadState<FindingSummary[]>> {
  const state = await listE2Findings(baseUrl ?? (await apiBaseUrl()), projectId, fetchImpl);
  if (state.status !== "ok") return state;
  return {
    status: "ok",
    data: state.data.map((row) => toSummary(row)),
    source: { kind: "api" },
  };
}

function toStoredAttempt(
  attemptId: string,
  targetRevision: string,
  observedAt: string | null,
  row: {
    scanId: string;
    packId: string;
    packVersion: string;
    verdict: StoredAttempt["verifierVerdict"];
    positiveControlPassed: boolean | null;
    negativeSecurityConditionMet: boolean | null;
    evidence: StoredAttempt["evidence"];
  },
): StoredAttempt {
  return {
    attemptId,
    scanId: row.scanId,
    packId: row.packId,
    packVersion: row.packVersion,
    targetRevision,
    verifierVerdict: row.verdict,
    positiveControlPassed: row.positiveControlPassed,
    negativeSecurityConditionMet: row.negativeSecurityConditionMet,
    observedAt,
    evidence: row.evidence,
  };
}

export async function loadFindingDetail(
  findingId: string,
  fetchImpl: FetchImpl = fetch,
  baseUrl?: string,
): Promise<LoadState<FindingDetail>> {
  if (findingId === DEMO_FINDING_ID) {
    const detail = demoFindingDetail();
    return { status: "ok", data: detail, source: detail.source };
  }
  const base = baseUrl ?? (await apiBaseUrl());
  const finding = await getE2Finding(base, findingId, fetchImpl);
  if (finding.status !== "ok") return finding;
  const row = finding.data;

  const [occurrences, guidance, scope] = await Promise.all([
    listE2Occurrences(base, findingId, fetchImpl),
    getFixPrompt(base, findingId, fetchImpl),
    row.projectId === null ? Promise.resolve(null) : getE2Scope(base, row.projectId, fetchImpl),
  ]);

  const storedAttempts: StoredAttempt[] = [];
  const confirmingId =
    row.latestConfirmedAttemptId ??
    (occurrences.status === "ok" ? (occurrences.data[0]?.attemptId ?? null) : null);
  if (confirmingId !== null) {
    const attempt = await getE2Attempt(base, confirmingId, fetchImpl);
    if (attempt.status === "ok") {
      const occurrence = occurrences.status === "ok" ?
        occurrences.data.find((item) => item.attemptId === confirmingId) ?? null
      : null;
      storedAttempts.push(
        toStoredAttempt(attempt.data.id, occurrence?.targetRevision ?? "unknown", occurrence?.observedAt ?? null, {
          scanId: attempt.data.scanId,
          packId: attempt.data.packId,
          packVersion: attempt.data.packVersion,
          verdict: attempt.data.verdict,
          positiveControlPassed: attempt.data.positiveControlPassed,
          negativeSecurityConditionMet: attempt.data.negativeSecurityConditionMet,
          evidence: attempt.data.evidence.map((item) => ({
            id: item.id,
            artifactKind: item.artifactKind,
            sha256: item.sha256,
            byteSize: item.byteSize,
            contentType: item.contentType,
          })),
        }),
      );
    }
  }

  let replayDefaults: ReplayDefaults | null = null;
  if (scope !== null && scope.status === "ok" && scope.data.permittedEnvironment !== null) {
    replayDefaults = {
      patchedEnvironmentId: scope.data.permittedEnvironmentId,
      patchedRevision: scope.data.permittedEnvironment.currentRevision,
      authorizationScopeId: scope.data.id,
      environmentLabel: scope.data.permittedEnvironment.label,
    };
  }

  // Stored model explanation for the confirming attempt. Any failure or
  // absence maps to null — the panel renders its unavailable state and the
  // oracle verdict stands unchanged. Never a client-assigned verdict.
  let explanation: StoredExplanation | null = null;
  if (confirmingId !== null) {
    const stored = await getE2Explanation(base, confirmingId, fetchImpl);
    if (stored.status === "ok") {
      explanation = {
        attemptId: stored.data.attemptId,
        oracleVerdict: stored.data.oracleVerdict,
        replayVerdict: stored.data.replayVerdict,
        summary: stored.data.summary,
        whatHappened: stored.data.whatHappened,
        whyVerdict: stored.data.whyVerdict,
        replayMeaning: stored.data.replayMeaning,
        followUp: stored.data.followUp,
        evidenceIds: stored.data.evidenceIds,
        requestedModel: stored.data.requestedModel,
        responseModel: stored.data.responseModel,
        requestId: stored.data.requestId,
        latencyMs: stored.data.latencyMs,
        rejectionCode: stored.data.rejectionCode,
      };
    }
  }

  return {
    status: "ok",
    data: {
      finding: {
        id: row.id,
        title: row.title,
        category: row.category,
        severity: row.severity,
        confidence: row.confidence,
        remediationStatus: row.remediationStatus,
        firstSeenAt: row.firstSeenAt,
        lastSeenAt: row.lastSeenAt,
        summary: row.summary,
        stableFingerprint: row.stableFingerprint,
      },
      attempt: null,
      storedAttempts,
      fixGuidance:
        guidance.status === "ok" ?
          {
            rootCause: guidance.data.rootCause,
            smallestFix: guidance.data.smallestFix,
            requiredInvariants: guidance.data.requiredInvariants,
            testGuidance: guidance.data.testGuidance,
            provenance: "api" as const,
          }
        : null,
      replay: null,
      patchedAttempt: null,
      replayDefaults,
      explanation,
      source: { kind: "api" },
    },
    source: { kind: "api" },
  };
}

export function demoSummary(): FindingSummary {
  return demoFindingSummary();
}
