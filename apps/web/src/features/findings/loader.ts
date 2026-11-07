/**
 * Server-side loaders for findings/replays pages (L10).
 *
 * Runs in Server Components only: resolves the same-origin BFF base URL
 * from request headers and maps contracted API rows to view models.
 * The demo finding bypasses the network and serves the labeled synthetic
 * dataset. Every failure mode maps to an explicit `LoadState`.
 */

import { headers } from "next/headers";
import type { Finding } from "@highcastle/contracts";
import { getFinding, getFixPrompt, listFindings } from "./api-client";
import { DEMO_FINDING_ID, demoFindingDetail, demoFindingSummary } from "./demo";
import type { FindingDetail, FindingSummary, LoadState } from "./types";

async function apiBaseUrl(): Promise<string> {
  const incoming = await headers();
  const host = incoming.get("host") ?? "localhost:3000";
  const proto = incoming.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

function toSummary(row: Finding): FindingSummary {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    severity: row.severity,
    confidence: row.confidence,
    remediationStatus: row.remediationStatus,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
  };
}

export async function loadFindingList(projectId: string): Promise<LoadState<FindingSummary[]>> {
  const state = await listFindings(await apiBaseUrl(), projectId);
  if (state.status !== "ok") return state;
  return { status: "ok", data: state.data.map(toSummary), source: { kind: "api" } };
}

export async function loadFindingDetail(findingId: string): Promise<LoadState<FindingDetail>> {
  if (findingId === DEMO_FINDING_ID) {
    return { status: "ok", data: demoFindingDetail(), source: demoFindingDetail().source };
  }
  const baseUrl = await apiBaseUrl();
  const [finding, guidance] = await Promise.all([
    getFinding(baseUrl, findingId),
    getFixPrompt(baseUrl, findingId),
  ]);
  if (finding.status !== "ok") return finding;
  return {
    status: "ok",
    data: {
      finding: {
        ...toSummary(finding.data),
        summary: finding.data.summary,
        stableFingerprint: finding.data.stableFingerprint,
      },
      attempt: null,
      fixGuidance:
        guidance.status === "ok"
          ? {
              rootCause: guidance.data.rootCause,
              smallestFix: guidance.data.smallestFix,
              requiredInvariants: guidance.data.requiredInvariants,
              testGuidance: guidance.data.testGuidance,
              provenance: "api" as const,
            }
          : null,
      replay: null,
      patchedAttempt: null,
      replayDefaults: {
        patchedEnvironmentId: "",
        patchedRevision: "lab-v2-patched",
        authorizationScopeId: "",
      },
      source: { kind: "api" },
    },
    source: { kind: "api" },
  };
}

export function demoSummary(): FindingSummary {
  return demoFindingSummary();
}
