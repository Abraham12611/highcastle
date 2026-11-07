"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BlockedState,
  Button,
  ConfirmModal,
  ErrorState,
  InconclusiveState,
  LoadingState,
  VerdictBadge,
} from "@highcastle/ui";
import type { Replay } from "@highcastle/contracts";
import { getReplay, requestReplay, type ReplayRequestResult } from "../api-client";
import type { AttemptRecord, FindingDetail, ReplayRecord } from "../types";
import {
  buildComparison,
  buildLiveComparison,
  canDisplayVerifiedFixed,
  replayForDisplay,
  verdictExplainer,
} from "../view-model";
import { ReplayComparison } from "../../replays/components/ReplayComparison";
import styles from "./findings.module.css";

type Phase =
  | { name: "idle" }
  | { name: "confirming" }
  | { name: "running"; replayId: string }
  | { name: "done"; replay: ReplayRecord }
  | {
      name: "failed";
      title: string;
      message: string;
    };

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 30;

function toReplayRecord(row: Replay): ReplayRecord {
  return {
    replayId: row.id,
    originalAttemptId: row.originalAttemptId,
    replayAttemptId: null,
    packVersion: row.packVersion,
    originalRevision: row.patchedRevision,
    patchedRevision: row.patchedRevision,
    originalVerdict: "inconclusive",
    replayAttemptVerdict: "inconclusive",
    verdict: row.verdict ?? "inconclusive",
    completedAt: row.completedAt,
    assertions: {
      positivePassed: row.positiveAssertionPassed,
      negativeDenied: row.negativeAssertionPassed,
    },
  };
}

/**
 * Verify-fix flow (M42 confirm → real replay API → poll → verdict).
 *
 * The verdict displayed here always comes from the server replay row.
 * `originalVerdict`/`replayAttemptVerdict` are unknown for a live row
 * (the row carries assertion booleans, not full attempts), so they render
 * as inconclusive placeholders — they never feed
 * `canDisplayVerifiedFixed`, which sees only `replay.verdict`.
 */
export function ReplayPanel({
  findingId,
  attempt,
  patchedAttempt,
  initialReplay,
  replayDefaults,
  demoNote,
}: {
  findingId: string;
  attempt: AttemptRecord;
  /** Full recorded patched attempt — present for the demo record only. */
  patchedAttempt: AttemptRecord | null;
  initialReplay: ReplayRecord | null;
  replayDefaults: FindingDetail["replayDefaults"];
  demoNote: string | null;
}) {
  const [phase, setPhase] = useState<Phase>(
    initialReplay === null ? { name: "idle" } : { name: "done", replay: initialReplay },
  );
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const pollReplay = useCallback(async (replayId: string) => {
    for (let poll = 0; poll < MAX_POLLS; poll += 1) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      if (!alive.current) return;
      const state = await getReplay(window.location.origin, replayId);
      if (state.status !== "ok") continue;
      if (state.data.verdict !== null) {
        if (alive.current) setPhase({ name: "done", replay: toReplayRecord(state.data) });
        return;
      }
    }
    if (alive.current) {
      setPhase({
        name: "failed",
        title: "Verification timed out",
        message:
          "The replay did not finish in time. Its server record is preserved; try again later.",
      });
    }
  }, []);

  const startReplay = useCallback(async () => {
    setPhase({ name: "confirming" });
  }, []);

  const confirmReplay = useCallback(async () => {
    const baseUrl = window.location.origin;
    setPhase({ name: "running", replayId: "" });
    const result: ReplayRequestResult = await requestReplay(
      baseUrl,
      findingId,
      {
        originalAttemptId: attempt.attemptId,
        patchedEnvironmentId: replayDefaults.patchedEnvironmentId,
        patchedRevision: replayDefaults.patchedRevision,
        authorizationScopeId: replayDefaults.authorizationScopeId,
      },
      crypto.randomUUID(),
    );
    if (!alive.current) return;
    if (result.status === "accepted") {
      setPhase({ name: "running", replayId: result.replayId });
      await pollReplay(result.replayId);
      return;
    }
    if (result.status === "not-found") {
      setPhase({
        name: "failed",
        title: "Replay API not available",
        message:
          "The replay endpoint is not served yet (L18). No verification was started and no badge was changed.",
      });
      return;
    }
    if (result.status === "unauthorized" || result.status === "forbidden") {
      setPhase({
        name: "failed",
        title: "Not permitted to run verification",
        message:
          "Your session may not start replays in this workspace. Sign in with an authorized account.",
      });
      return;
    }
    setPhase({
      name: "failed",
      title: "Could not reach the replay service",
      message: result.detail,
    });
  }, [attempt.attemptId, findingId, pollReplay, replayDefaults]);

  const display = replayForDisplay(
    phase.name === "done" ? phase.replay : phase.name === "running" ? null : initialReplay,
  );

  const comparison =
    phase.name === "done" &&
    patchedAttempt !== null &&
    phase.replay.replayId === initialReplay?.replayId
      ? buildComparison(attempt, patchedAttempt)
      : phase.name === "done" && phase.replay.assertions !== null
        ? buildLiveComparison(attempt, {
            label: `After · ${phase.replay.patchedRevision} (patched)`,
            environment: "server replay assertions",
            summary: `Replay ${phase.replay.replayId} · original attempt ${phase.replay.originalAttemptId}.`,
            positivePassed: phase.replay.assertions.positivePassed,
            negativeDenied: phase.replay.assertions.negativeDenied,
          })
        : initialReplay !== null && patchedAttempt !== null
          ? buildComparison(attempt, patchedAttempt)
          : null;

  const replayForBanner = phase.name === "done" ? phase.replay : (initialReplay ?? null);

  return (
    <section aria-label="Patch replay" className="hc-replay">
      <div className={styles.replayHead}>
        <p>{display.headline}</p>
        {phase.name === "idle" || phase.name === "failed" ? (
          <Button variant="primary" onClick={() => void startReplay()}>
            Verify against updated test app
          </Button>
        ) : null}
      </div>

      {demoNote !== null ? (
        <p className={styles.demoNote} role="note">
          {demoNote} The button above still calls the real replay API; the comparison below shows
          the recorded run until a live replay finishes.
        </p>
      ) : null}

      {phase.name === "confirming" ? (
        <ConfirmModal
          open
          onClose={() =>
            setPhase(initialReplay ? { name: "done", replay: initialReplay } : { name: "idle" })
          }
          onConfirm={() => void confirmReplay()}
          title="Verify fix against the updated test app?"
          description={`Runs pack ${attempt.packId} v${attempt.packVersion} on ${replayDefaults.patchedRevision}. The original attempt is preserved; the new run gets its own attempt and scan IDs.`}
          confirmLabel="Run verification"
        />
      ) : null}

      {phase.name === "running" ? (
        <>
          <LoadingState label="Verification running" />
          <p role="status">
            Replay {phase.replayId === "" ? "starting" : phase.replayId} is executing in an isolated
            sandbox. This page polls the server record.
          </p>
        </>
      ) : null}

      {phase.name === "failed" && phase.title === "Replay API not available" ? (
        <BlockedState title={phase.title}>{phase.message}</BlockedState>
      ) : null}
      {phase.name === "failed" && phase.title !== "Replay API not available" ? (
        <ErrorState title={phase.title}>{phase.message}</ErrorState>
      ) : null}

      {comparison !== null && replayForBanner !== null ? (
        <>
          <p className={styles.verdictLine}>
            <VerdictBadge verdict={replayForBanner.verdict} />{" "}
            {verdictExplainer(replayForBanner.verdict)}
          </p>
          <ReplayComparison
            comparison={comparison}
            verdict={replayForBanner.verdict}
            provenance={[
              `Original attempt ${replayForBanner.originalAttemptId} · ${attempt.targetRevision}.`,
              `Replay ${replayForBanner.replayId} · ${replayForBanner.patchedRevision}.`,
              canDisplayVerifiedFixed(replayForBanner.verdict)
                ? "Verified fixed: server-stated cross-account denial plus working legitimate read."
                : "No verified-fixed badge: the server verdict does not confirm the patch.",
            ]}
          />
        </>
      ) : phase.name !== "running" ? (
        <InconclusiveState title="No replay evidence yet">
          Run verification to compare before and after side by side.
        </InconclusiveState>
      ) : null}
    </section>
  );
}
