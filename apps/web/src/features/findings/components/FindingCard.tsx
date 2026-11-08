import Link from "next/link";
import { ConfidenceBadge, RemediationBadge, SeverityBadge } from "@highcastle/ui";
import styles from "./findings.module.css";
import type { FindingSummary } from "../types";

function findingHref(workspaceSlug: string, projectId: string, findingId: string): string {
  return `/app/w/${workspaceSlug}/projects/${projectId}/findings/${findingId}`;
}

/**
 * One finding row: title plus the three independent axes — severity,
 * confidence, remediation — never merged into a single chip.
 */
export function FindingCard({
  workspaceSlug,
  projectId,
  finding,
}: {
  workspaceSlug: string;
  projectId: string;
  finding: FindingSummary;
}) {
  return (
    <article className={styles.card}>
      <Link href={findingHref(workspaceSlug, projectId, finding.id)} className={styles.cardLink}>
        <h3>{finding.title}</h3>
      </Link>
      <div className={styles.axes} role="group" aria-label="Finding assessment axes">
        <SeverityBadge severity={finding.severity} size="sm" />
        <ConfidenceBadge confidence={finding.confidence} size="sm" />
        <RemediationBadge status={finding.remediationStatus} size="sm" />
      </div>
      <p className={styles.meta}>
        First seen {finding.firstSeenAt} · Last seen {finding.lastSeenAt}
      </p>
    </article>
  );
}
