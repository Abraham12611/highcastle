/**
 * Server-side replay loaders (L10).
 *
 * Demo replay renders the full recorded comparison. Live replays combine
 * the server replay row with the parent finding's recorded attempt when
 * available; otherwise the verdict and server assertions render alone —
 * never padded with invented legs.
 */

import { headers } from "next/headers";
import type { ReplayVerdict } from "@highcastle/contracts";
import { getReplay } from "../findings/api-client";
import { DEMO_REPLAY_ID, demoFindingDetail, demoPatchedAttempt } from "../findings/demo";
import { loadFindingDetail } from "../findings/loader";
import {
  buildComparison,
  buildLiveComparison,
  type BeforeAfterComparison,
} from "../findings/view-model";
import type { LoadState } from "../findings/types";

export interface ReplayViewData {
  comparison: BeforeAfterComparison | null;
  verdict: ReplayVerdict;
  provenance: string[];
}

async function apiBaseUrl(): Promise<string> {
  const incoming = await headers();
  const host = incoming.get("host") ?? "localhost:3000";
  const proto = incoming.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export async function loadReplayView(replayId: string): Promise<LoadState<ReplayViewData>> {
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
        provenance: [
          `Original attempt ${replay.originalAttemptId} · ${replay.originalRevision}.`,
          `Replay ${replay.replayId} · ${replay.patchedRevision}.`,
        ],
      },
      source: { kind: "demo", note: "Synthetic demo data." },
    };
  }

  const baseUrl = await apiBaseUrl();
  const replay = await getReplay(baseUrl, replayId);
  if (replay.status !== "ok") return replay;
  const row = replay.data;
  const verdict = row.verdict ?? "inconclusive";
  const provenance = [
    `Original attempt ${row.originalAttemptId}.`,
    `Replay ${row.id} · patched ${row.patchedRevision}.`,
  ];
  const finding = await loadFindingDetail(row.findingId);
  const before = finding.status === "ok" ? finding.data.attempt : null;
  if (before === null) {
    return {
      status: "ok",
      data: { comparison: null, verdict, provenance },
      source: { kind: "api" },
    };
  }
  return {
    status: "ok",
    data: {
      comparison: buildLiveComparison(before, {
        label: `After · ${row.patchedRevision} (patched)`,
        environment: `pack ${row.packVersion}`,
        summary: `Replay ${row.id} · original attempt ${row.originalAttemptId}.`,
        positivePassed: row.positiveAssertionPassed,
        negativeDenied: row.negativeAssertionPassed,
      }),
      verdict,
      provenance,
    },
    source: { kind: "api" },
  };
}
