/**
 * Server-side replay loaders (L10).
 *
 * Demo replay renders the full recorded comparison. Live replays use
 * E2's replay VIEW (server verdict, assertion booleans, attempt
 * pointers) combined with the parent finding's stored attempt for the
 * before side. A verdict of `verified_fixed` is displayed only when the
 * server view persists it; a null verdict renders the pending state.
 */

import { headers } from "next/headers";
import type { ReplayVerdict } from "@highcastle/contracts";
import { getE2ReplayView } from "../findings/e2-client";
import { loadFindingDetail } from "../findings/loader";
import {
  DEMO_REPLAY_ID,
  demoFindingDetail,
  demoPatchedAttempt,
} from "../findings/demo";
import {
  buildComparison,
  buildStoredComparison,
  type BeforeAfterComparison,
} from "../findings/view-model";
import type { LoadState, StoredAttempt } from "../findings/types";

export interface ReplayViewData {
  comparison: BeforeAfterComparison | null;
  verdict: ReplayVerdict;
  /** True while the server verdict is still null (replay running). */
  pending: boolean;
  provenance: string[];
}

async function apiBaseUrl(): Promise<string> {
  const incoming = await headers();
  const host = incoming.get("host") ?? "localhost:3000";
  const proto = incoming.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

function storedSide(stored: StoredAttempt, label: string) {
  return {
    label,
    environment: `pack ${stored.packId} v${stored.packVersion}`,
    summary: `Stored attempt ${stored.attemptId}.`,
    positive: stored.positiveControlPassed,
    negativeDenied: stored.negativeSecurityConditionMet,
  };
}

export async function loadReplayView(
  replayId: string,
  fetchImpl?: (typeof fetch),
  baseUrl?: string,
): Promise<LoadState<ReplayViewData>> {
  if (replayId === DEMO_REPLAY_ID) {
    const detail = demoFindingDetail();
    if (detail.attempt === null) {
      return { status: "unavailable", detail: "demo evidence missing" };
    }
    const patched = demoPatchedAttempt();
    const replay = detail.replay;
    if (replay === null) {
      return { status: "unavailable", detail: "demo replay missing" };
    }
    return {
      status: "ok",
      data: {
        comparison: buildComparison(detail.attempt, patched),
        verdict: replay.verdict,
        pending: false,
        provenance: [
          `Original attempt ${replay.originalAttemptId} · ${replay.originalRevision}.`,
          `Replay ${replay.replayId} · ${replay.patchedRevision}.`,
        ],
      },
      source: { kind: "demo", note: "Synthetic demo data." },
    };
  }

  const base = baseUrl ?? (await apiBaseUrl());
  const run = fetchImpl ?? fetch;
  const replay = await getE2ReplayView(base, replayId, run);
  if (replay.status !== "ok") return replay;
  const view = replay.data;
  // The ONLY verdict source: the server-persisted replay verdict. A null
  // (pending) verdict never displays any fixed badge.
  // The ONLY verdict source: the server-persisted replay verdict. A null
  // (still running) verdict renders the pending state, never a badge.
  const verdict: ReplayVerdict = view.verdict ?? "inconclusive";
  const provenance = [
    `Original attempt ${view.originalAttempt?.id ?? "unknown"}.`,
    `Replay ${view.id} · patched ${view.patchedRevision}.`,
  ];
  const finding = await loadFindingDetail(view.findingId, run, base);
  const stored = finding.status === "ok" ? (finding.data.storedAttempts[0] ?? null) : null;
  if (stored === null) {
    return {
      status: "ok",
      data: { comparison: null, verdict, pending: view.verdict === null, provenance },
      source: { kind: "api" },
    };
  }
  return {
    status: "ok",
    data: {
      comparison: buildStoredComparison(storedSide(stored, `Before · ${stored.targetRevision} (stored)`), {
        label: `After · ${view.patchedRevision} (patched)`,
        environment: `pack ${view.packId} v${view.packVersion}`,
        summary: `Replay ${view.id} · original attempt ${view.originalAttempt?.id ?? "unknown"}.`,
        positive: view.positiveAssertionPassed,
        negativeDenied: view.negativeAssertionPassed,
      }),
      verdict,
      pending: view.verdict === null,
      provenance,
    },
    source: { kind: "api" },
  };
}
