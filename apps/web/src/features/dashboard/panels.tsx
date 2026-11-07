import Link from "next/link";
import {
  BlockedState,
  ConfidenceBadge,
  EmptyState,
  ErrorState,
  Panel,
  PanelBody,
  PanelHeader,
  RemediationBadge,
  ScanStatusBadge,
  ScopePanel,
  SeverityMeter,
} from "@highcastle/ui";
import type { Finding, ScanSummary } from "./api";
import { summarizeFindings, summarizeScans } from "./api";
import { appPaths } from "./nav";
import styles from "./panels.module.css";

/**
 * Data panels for workspace + project overviews.
 *
 * Server components over REAL API rows only. Copy stays honest: counts are
 * labeled as counts, empty means "none recorded", and every failure renders
 * a retry — never a placeholder number.
 */

export function CountsRow({ scans, findings }: { scans: ScanSummary[]; findings: Finding[] }) {
  const scanCounts = summarizeScans(scans);
  const findingCounts = summarizeFindings(findings);
  const items = [
    { label: "Scans recorded", value: String(scanCounts.total) },
    { label: "Active now", value: String(scanCounts.active) },
    { label: "Findings recorded", value: String(findingCounts.total) },
    { label: "Confirmed by execution", value: String(findingCounts.confirmedByExecution) },
    { label: "Open", value: String(findingCounts.open) },
    { label: "Verified fixed", value: String(findingCounts.verifiedFixed) },
  ];
  return (
    <dl className={styles.counts} aria-label="Recorded scan and finding counts">
      {items.map((item) => (
        <div key={item.label} className={styles.count}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ActiveScanBanner({
  workspaceSlug,
  projectId,
  scan,
}: {
  workspaceSlug: string;
  projectId: string;
  scan: ScanSummary;
}) {
  return (
    <div className={styles.banner} role="status">
      <span className={styles.bannerDot} aria-hidden="true" />
      <p>
        <strong>Scan running.</strong> {scan.coverage.packIds.join(", ")} against the authorized
        target{scan.phase ? ` — phase ${scan.phase}` : ""}.
      </p>
      <Link
        className={styles.bannerLink}
        href={appPaths.scanLive(workspaceSlug, projectId, scan.scanId)}
      >
        Watch live
      </Link>
    </div>
  );
}

export interface ScanListItem {
  scan: ScanSummary;
  projectId: string;
}

export function ScanList({
  workspaceSlug,
  items,
  newScanHref,
  emptyTitle = "No scans recorded",
  emptyBody = "No scans recorded yet. A scan runs the approved test pack against the authorized target only.",
}: {
  workspaceSlug: string;
  items: ScanListItem[];
  newScanHref: string;
  emptyTitle?: string;
  emptyBody?: string;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        actions={
          <Link className={styles.cta} href={newScanHref}>
            Run the first assessment
          </Link>
        }
      >
        {emptyBody}
      </EmptyState>
    );
  }
  return (
    <ul className={styles.rows}>
      {items.slice(0, 5).map(({ scan, projectId }) => (
        <li key={scan.scanId} className={styles.row}>
          <span className={styles.rowMain}>
            <Link
              href={appPaths.scanDetail(workspaceSlug, projectId, scan.scanId)}
              className={styles.rowTitle}
            >
              {scan.coverage.packIds.join(", ")} · {scan.versions.targetRevision}
            </Link>
            <span className={styles.rowMeta}>
              {scan.executedCount} of {scan.plannedCount} checks run
              {scan.confirmedCount > 0 ? ` · ${scan.confirmedCount} confirmed` : ""}
            </span>
          </span>
          <ScanStatusBadge status={scan.status} />
        </li>
      ))}
    </ul>
  );
}

export function FindingList({
  workspaceSlug,
  findings,
  developer,
}: {
  workspaceSlug: string;
  findings: Finding[];
  developer: boolean;
}) {
  if (findings.length === 0) {
    return (
      <EmptyState title="No issues reproduced within tested coverage">
        The checks run so far did not reproduce a vulnerability. Other vulnerabilities may remain
        outside the tested coverage.
      </EmptyState>
    );
  }
  return (
    <ul className={styles.rows}>
      {findings.slice(0, 5).map((finding) => (
        <li key={finding.id} className={styles.row}>
          <span className={styles.rowMain}>
            <Link
              href={appPaths.findingDetail(workspaceSlug, finding.projectId, finding.id)}
              className={styles.rowTitle}
            >
              {finding.title}
            </Link>
            <span className={styles.rowMeta}>
              <SeverityMeter severity={finding.severity} />
              <ConfidenceBadge confidence={finding.confidence} />
              <RemediationBadge status={finding.remediationStatus} />
              {developer ? (
                <span className={styles.fingerprint}>{finding.stableFingerprint}</span>
              ) : null}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export interface ReadinessItem {
  key: string;
  label: string;
  ok: boolean;
  detail?: string;
  href?: string;
}

/** Readiness checklist from real target/env/scope/preflight rows. */
export function ReadinessChecklist({ items }: { items: ReadinessItem[] }) {
  const blocked = items.filter((item) => !item.ok);
  return (
    <Panel>
      <PanelHeader title="Launch readiness" />
      <PanelBody>
        <ul className={styles.checklist}>
          {items.map((item) => (
            <li key={item.key} className={styles.check} data-ok={item.ok}>
              <span aria-hidden="true" className={styles.checkMark}>
                {item.ok ? "✓" : "!"}
              </span>
              <span>
                <strong>{item.label}</strong>
                {item.detail ? <span className={styles.rowMeta}> — {item.detail}</span> : null}
                {item.href && !item.ok ? (
                  <>
                    {" "}
                    <Link href={item.href} className={styles.inlineLink}>
                      Review
                    </Link>
                  </>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
        {blocked.length > 0 ? (
          <p className={styles.note}>
            {blocked.length} readiness {blocked.length === 1 ? "check" : "checks"} failing — scans
            stay queued until each passes.
          </p>
        ) : (
          <p className={styles.note}>All readiness checks pass. New assessments can be launched.</p>
        )}
      </PanelBody>
    </Panel>
  );
}

export function ScopeSummaryPanel({
  scope,
}: {
  scope: {
    status: "active" | "revoked" | "expired";
    allowedHosts: string[];
    allowedPaths: string[];
    allowedTestPackIds: string[];
    allowedMethods: string[];
    expiresAt: string;
  };
}) {
  return (
    <ScopePanel
      status={scope.status}
      entries={[
        { label: "Allowed hosts", value: scope.allowedHosts.join(", ") },
        { label: "Allowed paths", value: scope.allowedPaths.join(", ") },
        { label: "Test packs", value: scope.allowedTestPackIds.join(", ") },
        { label: "Methods", value: scope.allowedMethods.join(", ") },
        { label: "Expires", value: new Date(scope.expiresAt).toLocaleDateString() },
      ]}
      footer="Recorded authorization scope — read-only. Changes require a new approved version."
    />
  );
}

export function FailedPanel({
  title,
  message,
  requestId,
  retryHref,
}: {
  title: string;
  message: string;
  requestId?: string | undefined;
  retryHref: string;
}) {
  return (
    <ErrorState
      title={title}
      {...(requestId ? { diagnostic: requestId } : {})}
      actions={
        <Link className={styles.cta} href={retryHref}>
          Try again
        </Link>
      }
    >
      {message}
    </ErrorState>
  );
}

export function UnauthorizedPanel({
  returnTo,
  reason,
}: {
  returnTo: string;
  reason: "signed-out" | "no-access";
}) {
  return (
    <BlockedState
      title={reason === "signed-out" ? "Sign in required" : "No access to this workspace"}
      {...(reason === "signed-out" ? {} : { reference: "workspace-membership" })}
      actions={
        reason === "signed-out" ? (
          <Link className={styles.cta} href={appPaths.signIn(returnTo)}>
            Sign in
          </Link>
        ) : undefined
      }
    >
      {reason === "signed-out"
        ? "Your session ended or was never established. Sign in to continue — you will return here afterwards."
        : "This workspace is not shared with your account. Unknown workspaces read the same as missing ones, so contact an owner for access."}
    </BlockedState>
  );
}
