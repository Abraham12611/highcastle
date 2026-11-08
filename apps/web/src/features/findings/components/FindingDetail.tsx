"use client";

import { useState } from "react";
import { ButtonRow, Callout, InconclusiveState, Tabs, Button } from "@highcastle/ui";
import type { ExperienceMode, FindingDetail } from "../types";
import styles from "./findings.module.css";
import { attemptVerdictExplainer, invariantCopy } from "../view-model";
import { AttackPathPanel } from "./AttackPathPanel";
import { FindingHeader } from "./FindingHeader";
import { ExplanationPanel } from "./ExplanationPanel";
import { FixPanel } from "./FixPanel";
import { ProofPanel } from "./ProofPanel";
import { ReplayPanel } from "./ReplayPanel";

export type FindingTabKey = "overview" | "attack-path" | "proof" | "replay" | "explanation" | "fix";

function MissingEvidence({ what }: { what: string }) {
  return (
    <InconclusiveState title={`${what} unavailable`}>
      The findings API has not served the redacted execution evidence for this finding yet. Recorded
      proof appears here once the backend serves it — nothing is shown in its place.
    </InconclusiveState>
  );
}

/**
 * Finding detail shell: header with the three axes, Builder/Developer
 * mode toggle, and detail tabs. The mode only changes explanation depth —
 * never evidence, verdicts, or status.
 */
export function FindingDetail({
  detail,
  initialTab = "overview",
}: {
  detail: FindingDetail;
  initialTab?: FindingTabKey;
}) {
  const [mode, setMode] = useState<ExperienceMode>("builder");
  const invariant = invariantCopy(mode);

  return (
    <article className={styles.page}>
      {detail.source.kind === "demo" ? (
        <Callout tone="warning" title="Synthetic demo data">
          <p>{detail.source.note}</p>
        </Callout>
      ) : null}

      <FindingHeader detail={detail} />

      <div className={styles.modeToggle} role="group" aria-label="Explanation mode">
        <span>Explain like:</span>
        <ButtonRow>
          <Button
            variant={mode === "builder" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setMode("builder")}
            aria-pressed={mode === "builder"}
          >
            Builder
          </Button>
          <Button
            variant={mode === "developer" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setMode("developer")}
            aria-pressed={mode === "developer"}
          >
            Developer
          </Button>
        </ButtonRow>
      </div>

      <Tabs
        aria-label="Finding detail sections"
        defaultKey={initialTab}
        items={[
          {
            key: "overview",
            label: "Overview",
            panel: (
              <section aria-label="Overview">
                <p className={styles.summary}>{detail.finding.summary}</p>
                <Callout tone="info" title={invariant.title}>
                  <p>{invariant.body}</p>
                </Callout>
                <p>
                  {detail.attempt !== null
                    ? attemptVerdictExplainer(detail.attempt.verdict, mode)
                    : detail.storedAttempts[0] !== undefined
                      ? `Stored oracle verdict: ${detail.storedAttempts[0].verifierVerdict ?? "pending"}. Recorded control outcomes and evidence digests appear under Proof; response bodies are not served by the API.`
                      : "Execution evidence is still loading from the API."}
                </p>
              </section>
            ),
          },
          {
            key: "attack-path",
            label: "Attack path",
            panel:
              detail.attempt === null ? (
                <MissingEvidence what="Attack path" />
              ) : (
                <AttackPathPanel attempt={detail.attempt} />
              ),
          },
          {
            key: "proof",
            label: "Proof",
            panel:
              detail.attempt === null && detail.storedAttempts.length === 0 ? (
                <MissingEvidence what="Execution proof" />
              ) : (
                <ProofPanel
                  baseline={detail.attempt?.baseline ?? null}
                  crossAccount={detail.attempt?.crossAccount ?? null}
                  packId={
                    detail.attempt?.packId ?? detail.storedAttempts[0]?.packId ?? "bola-invoice-v1"
                  }
                  packVersion={
                    detail.attempt?.packVersion ?? detail.storedAttempts[0]?.packVersion ?? "1.0.0"
                  }
                  oracleVersion={detail.attempt?.oracleVersion ?? "bola-oracle-v1"}
                  targetRevision={
                    detail.attempt?.targetRevision ??
                    detail.storedAttempts[0]?.targetRevision ??
                    "unknown"
                  }
                  fixtureVersion={detail.attempt?.fixtureVersion ?? "unknown"}
                  verdictReasons={detail.attempt?.verdictReasons ?? []}
                  stored={detail.storedAttempts}
                />
              ),
          },
          {
            key: "replay",
            label: "Replay",
            panel:
              detail.attempt === null && detail.storedAttempts.length === 0 ? (
                <MissingEvidence what="Replay" />
              ) : (
                <ReplayPanel
                  findingId={detail.finding.id}
                  attempt={detail.attempt}
                  stored={detail.storedAttempts[0] ?? null}
                  patchedAttempt={detail.patchedAttempt}
                  initialReplay={detail.replay}
                  replayDefaults={detail.replayDefaults}
                  demoNote={detail.source.kind === "demo" ? detail.source.note : null}
                />
              ),
          },
          {
            key: "explanation",
            label: "Explanation",
            panel: <ExplanationPanel explanation={detail.explanation ?? null} />,
          },
          {
            key: "fix",
            label: "Fix",
            panel: (
              <FixPanel
                title={detail.finding.title}
                fingerprint={detail.finding.stableFingerprint}
                attempt={detail.attempt}
                stored={detail.storedAttempts[0] ?? null}
                guidance={detail.fixGuidance}
                mode={mode}
              />
            ),
          },
        ]}
      />
    </article>
  );
}
