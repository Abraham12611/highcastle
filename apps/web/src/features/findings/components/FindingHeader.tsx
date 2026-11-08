import { ConfidenceBadge, RemediationBadge, SeverityBadge, SnapshotPill } from "@highcastle/ui";
import type { FindingDetail } from "../types";
import styles from "./findings.module.css";

/**
 * Finding header: title, stable fingerprint, and the three independent
 * assessment axes as separate badges. The "verified" state appears only
 * via `RemediationBadge status="verified_fixed"`, which the server sets
 * after an oracle-derived replay verdict — never from client state.
 */
export function FindingHeader({ detail }: { detail: FindingDetail }) {
  return (
    <header className="hc-finding-header">
      <p className={styles.fingerprint}>{detail.finding.stableFingerprint}</p>
      <h2>{detail.finding.title}</h2>
      <div className={styles.axes} role="group" aria-label="Finding assessment axes">
        <SeverityBadge severity={detail.finding.severity} />
        <ConfidenceBadge confidence={detail.finding.confidence} />
        <RemediationBadge status={detail.finding.remediationStatus} />
      </div>
      <div className={styles.provenance}>
        {detail.attempt === null ? (
          <span className={styles.pending}>Recorded evidence pending from the findings API.</span>
        ) : (
          <>
            <SnapshotPill revision={detail.attempt.attemptId} label="attempt" />
            <SnapshotPill revision={detail.attempt.targetRevision} label="target" />
            <SnapshotPill
              revision={`${detail.attempt.packId}@${detail.attempt.packVersion}`}
              label="pack"
            />
          </>
        )}
      </div>
    </header>
  );
}
