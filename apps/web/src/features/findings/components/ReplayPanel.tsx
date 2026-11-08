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
import { getE2ReplayView, requestE2Replay } from "../e2-client";
import type {
  AttemptRecord,
  ReplayDefaults,
  ReplayRecord,
  StoredAttempt,
} from "../types";
import {
  buildComparison,
  buildLiveComparison,
  buildStoredComparison,
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

function toReplayRecord(
  view: {
    id: string;
    verdict: ReplayRecord["verdict"];
    patchedRevision: string;
    packVersion: string;
    positiveAssertionPassed: boolean | null;
    negativeAssertionPassed: boolean | null;
    originalAttemptId: string | null;
  },
  completedAt: string | null,
): ReplayRecord {
  return {
    replayId: view.id,
    originalAttemptId: view.originalAttemptId,
    replayAttemptId: null,
    packVersion: view.packVersion,
    originalRevision: "unknown",
    patchedRevision: view.patchedRevision,
    originalVerdict: "inconclusive",
    replayAttemptVerdict: "inconclusive",
    verdict: view.verdict,
    completedAt,
    assertions: {
      positivePassed: view.positiveAssertionPassed,
      negativeDenied: view.negativeAssertionPassed,
    },
  };
}

/**
 * Verify-fix flow (M42 confirm → real replay API → poll → verdict).
 *
 * The verdict displayed here always comes from the server replay view.
 * The before side prefers recorded full legs (demo), else the stored
 * attempt's server-stated controls; the after side always renders server
 * assertions. `canDisplayVerifiedFixed` sees only the server verdict.
 */
export function ReplayPanel({
  findingId,
  attempt,
  stored,
  patchedAttempt,
  initialReplay,
  replayDefaults,
  demoNote,
}: {
  findingId: string;
  /** Full recorded legs — present for the demo record only. */
  attempt: AttemptRecord | null;
  /** Stored server attempt — the live before side. */
  stored: StoredAttempt | null;
  /** Full recorded patched attempt — present for the demo record only. */
  patchedAttempt: AttemptRecord | null;
  initialReplay: ReplayRecord | null;
  /** Null until the scope endpoint resolves a real environment + scope. */
  replayDefaults: ReplayDefaults | null;
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

  const knownOriginalAttemptId = attempt?.attemptId ?? stored?.attemptId ?? null;

  const pollReplay = useCallback(
    async (replayId: string, originalAttemptId: string | null) => {
      for (let poll = 0; poll < MAX_POLLS; poll += 1) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        if (!alive.current) return;
        const state = await getE2ReplayView(window.location.origin, replayId);
        if (state.status !== "ok") continue;
        const view = state.data;
        if (view.verdict !== null) {
          if (alive.current) {
            setPhase({
              name: "done",
              replay: toReplayRecord(
                {
                  id: view.id,
                  verdict: view.verdict,
                  patchedRevision: view.patchedRevision,
                  packVersion: view.packVersion,
                  positiveAssertionPassed: view.positiveAssertionPassed,
                  negativeAssertionPassed: view.negativeAssertionPassed,
                  originalAttemptId: view.originalAttempt?.id ?? originalAttemptId,
                },
                view.replayAttempts.length > 0 ? new Date().toISOString() : null,
              ),
            });
          }
          return;
        }
      }
      if (alive.current) {
        setPhase({
          name: "failed",
          title: "Verification timed out",
          message: "The replay did not finish in time. Its server record is preserved; try again later.",
        });
      }
    },
    [],
  );

  const startReplay = useCallback(async () => {
    setPhase({ name: "confirming" });
  }, []);

  const confirmReplay = useCallback(async () => {
    if (replayDefaults === null || knownOriginalAttemptId === null) return;
    setPhase({ name: "running", replayId: "" });
    const result = await requestE2Replay(
      window.location.origin,
      findingId,
      {
        originalAttemptId: knownOriginalAttemptId,
        patchedEnvironmentId: replayDefaults.patchedEnvironmentId,
        patchedRevision: replayDefaults.patchedRevision,
        authorizationScopeId: replayDefaults.authorizationScopeId,
      },
      crypto.randomUUID(),
    );
    if (!alive.current) return;
    if (result.status === "accepted") {
      setPhase({ name: "running", replayId: result.replayId });
      await pollReplay(result.replayId, knownOriginalAttemptId);
      return;
    }
    if (result.status === "not-found") {
      setPhase({
        name: "failed",
        title: "Replay API not available",
        message:
          "The replay endpoint is not served yet. No verification was started and no badge was changed.",
      });
      return;
    }
    if (result.status === "unauthorized" || result.status === "forbidden") {
      setPhase({
        name: "failed",
        title: "Not permitted to run verification",
        message: "Your session may not start replays in this workspace. Sign in with an authorized account.",
      });
      return;
    }
    setPhase({
      name: "failed",
      title: "Could not reach the replay service",
      message: result.detail,
    });
  }, [findingId, knownOriginalAttemptId, pollReplay, replayDefaults]);

  const display = replayForDisplay(
    phase.name === "done" ? phase.replay : phase.name === "running" ? null : initialReplay,
  );

  const beforeLabel =
    attempt !== null
      ? `Before · ${attempt.targetRevision} (vulnerable)`
      : stored !== null
        ? `Before · ${stored.targetRevision} (stored)`
        : "Before";

  const comparison =
    phase.name === "done" &&
    attempt !== null &&
    patchedAttempt !== null &&
    phase.replay.replayId === initialReplay?.replayId
      ? buildComparison(attempt, patchedAttempt)
      : phase.name === "done" && phase.replay.assertions !== null && attempt !== null
        ? buildLiveComparison(attempt, {
            label: `After · ${phase.replay.patchedRevision} (patched)`,
            environment: "server replay assertions",
            summary: `Replay ${phase.replay.replayId} · original attempt ${phase.replay.originalAttemptId ?? "unknown"}.`,
            positivePassed: phase.replay.assertions.positivePassed,
            negativeDenied: phase.replay.assertions.negativeDenied,
          })
        : phase.name === "done" && phase.replay.assertions !== null && stored !== null
          ? buildStoredComparison(
              {
                label: beforeLabel,
                environment: `pack ${stored.packId} v${stored.packVersion}`,
                summary: `Stored attempt ${stored.attemptId}.`,
                positive: stored.positiveControlPassed,
                negativeDenied: stored.negativeSecurityConditionMet,
              },
              {
                label: `After · ${phase.replay.patchedRevision} (patched)`,
                environment: "server replay assertions",
                summary: `Replay ${phase.replay.replayId} · original attempt ${phase.replay.originalAttemptId ?? "unknown"}.`,
                positive: phase.replay.assertions.positivePassed,
                negativeDenied: phase.replay.assertions.negativeDenied,
              },
            )
          : initialReplay !== null && attempt !== null && patchedAttempt !== null
            ? buildComparison(attempt, patchedAttempt)
            : null;

  const replayForBanner = phase.name === "done" ? phase.replay : (initialReplay ?? null);
  const canVerify = replayDefaults !== null && knownOriginalAttemptId !== null;

  return (
    <section aria-label="Patch replay">
      <div className={styles.replayHead}>
        <p>{display.headline}</p>
        {canVerify && (phase.name === "idle" || phase.name === "failed") ? (
          <Button variant="primary" onClick={() => void startReplay()}>
            Verify against updated test app
          </Button>
        ) : null}
      </div>

      {!canVerify && replayForBanner === null ? (
        <p role="note">
          Verification needs a resolved patched environment and authorization scope. The scope
          endpoint has not served them yet, so the button stays hidden rather than guessing.
        </p>
      ) : null}

      {demoNote !== null ? (
        <p className={styles.demoNote} role="note">
          {demoNote} The button above still calls the real replay API; the comparison below shows
          the recorded run until a live replay finishes.
        </p>
      ) : null}

      {phase.name === "confirming" && replayDefaults !== null ? (
        <ConfirmModal
          open
          onClose={() =>
            setPhase(initialReplay ? { name: "done", replay: initialReplay } : { name: "idle" })
          }
          onConfirm={() => void confirmReplay()}
          title="Verify fix against the updated test app?"
          description={`Runs the pack on ${replayDefaults.patchedRevision} in ${replayDefaults.environmentLabel ?? "the permitted environment"}. The original attempt is preserved; the new run gets its own attempt and scan IDs.`}
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
              `Original attempt ${replayForBanner.originalAttemptId ?? "unknown"} · ${attempt?.targetRevision ?? stored?.targetRevision ?? "unknown"}.`,
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
