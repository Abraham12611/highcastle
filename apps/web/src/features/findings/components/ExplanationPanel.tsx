import { Callout, EvidenceCard, InconclusiveState } from "@highcastle/ui";
import styles from "./findings.module.css";
import type { StoredExplanation } from "../types";

/**
 * Post-execution model explanation (Engineer 8, issue #55).
 *
 * Advisory prose only. The verdict shown here is the persisted oracle
 * verdict carried on the stored record — never a model claim. When the
 * model call failed safely or was rejected, the panel says so plainly
 * and keeps the independent verdict unchanged.
 */
export function ExplanationPanel({ explanation }: { explanation: StoredExplanation | null }) {
  if (explanation === null) {
    return (
      <InconclusiveState title="Model explanation unavailable">
        The evidence-grounded explanation has not been served for this finding yet. The independent
        oracle verdict above stands on its own — nothing is shown in its place.
      </InconclusiveState>
    );
  }
  if (explanation.summary === null) {
    return (
      <InconclusiveState title="Model explanation withheld">
        The model call did not produce a valid explanation
        {explanation.rejectionCode === null ? "" : ` (${explanation.rejectionCode})`} — the
        independent oracle verdict is unchanged. A retry runs server-side; no action is needed here.
      </InconclusiveState>
    );
  }
  return (
    <div className={styles.stack}>
      <Callout tone="info" title="What the independent check found">
        {explanation.summary}
      </Callout>
      <EvidenceCard
        kind="oracle"
        title={`Attempt ${explanation.attemptId}`}
        attemptRef={`oracle verdict: ${explanation.oracleVerdict}`}
        redacted
      >
        <dl className={styles.facts}>
          <div>
            <dt>What happened</dt>
            <dd>{explanation.whatHappened}</dd>
          </div>
          <div>
            <dt>Why this verdict</dt>
            <dd>{explanation.whyVerdict}</dd>
          </div>
          {explanation.replayMeaning === null ? null : (
            <div>
              <dt>What the replay demonstrates</dt>
              <dd>{explanation.replayMeaning}</dd>
            </div>
          )}
          {explanation.followUp === null ? null : (
            <div>
              <dt>Suggested follow-up</dt>
              <dd>{explanation.followUp}</dd>
            </div>
          )}
          <div>
            <dt>Evidence cited</dt>
            <dd className={styles.mono}>{explanation.evidenceIds.join(", ")}</dd>
          </div>
          <div>
            <dt>Model provenance</dt>
            <dd>
              {explanation.requestedModel}
              {explanation.responseModel === null ||
              explanation.responseModel === explanation.requestedModel
                ? ""
                : ` (reported ${explanation.responseModel})`}
              {explanation.requestId === null ? "" : ` · request ${explanation.requestId}`}
              {explanation.latencyMs === null ? "" : ` · ${explanation.latencyMs} ms`}
            </dd>
          </div>
        </dl>
      </EvidenceCard>
    </div>
  );
}
