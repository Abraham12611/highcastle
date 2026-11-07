import Link from "next/link";
import { Panel, PanelBody, PanelHeader } from "@highcastle/ui";
import type { Finding, ScanSummary } from "./api";
import type { ExperienceMode } from "./mode";
import { appPaths } from "./nav";
import {
  ActiveScanBanner,
  CountsRow,
  FindingList,
  ReadinessChecklist,
  ScopeSummaryPanel,
  ScanList,
  type ReadinessItem,
} from "./panels";
import styles from "./panels.module.css";

/**
 * Workspace + project overview compositions (H-03 / H-04).
 *
 * Pure compositions over caller-fetched rows: every panel below is honest
 * about provenance (recorded counts, empty states, failed panels are the
 * caller's responsibility — see `FailedPanel` / `UnauthorizedPanel`).
 */

export function WorkspaceOverview({
  workspaceSlug,
  workspaceName,
  mode,
  projects,
  scansByProject,
  findingsByProject,
}: {
  workspaceSlug: string;
  workspaceName: string;
  mode: ExperienceMode;
  projects: { id: string; slug: string; name: string }[];
  scansByProject: Map<string, ScanSummary[]>;
  findingsByProject: Map<string, Finding[]>;
}) {
  const allItems = [...scansByProject.entries()].flatMap(([projectId, scans]) =>
    scans.map((scan) => ({ scan, projectId })),
  );
  const allScans = allItems.map((item) => item.scan);
  const allFindings = [...findingsByProject.values()].flat();
  const activeItem = allItems.find(({ scan }) =>
    ["queued", "preparing", "recon", "planning", "executing", "verifying", "finalizing"].includes(
      scan.status,
    ),
  );
  const needsAttention = allFindings
    .filter(
      (finding) => finding.remediationStatus === "open" || finding.remediationStatus === "reopened",
    )
    .slice(0, 5);
  return (
    <div>
      <h1 className={styles.pageTitle}>{workspaceName}</h1>
      <p className={styles.pageSub}>
        {projects.length} {projects.length === 1 ? "project" : "projects"} · {allScans.length}{" "}
        recorded {allScans.length === 1 ? "scan" : "scans"} · {allFindings.length} recorded{" "}
        {allFindings.length === 1 ? "finding" : "findings"}
      </p>
      {activeItem ? (
        <ActiveScanBanner
          workspaceSlug={workspaceSlug}
          projectId={activeItem.projectId}
          scan={activeItem.scan}
        />
      ) : null}
      <CountsRow scans={allScans} findings={allFindings} />
      {needsAttention.length > 0 ? (
        <>
          <h2 className={styles.sectionTitle}>Needs attention</h2>
          <FindingList
            workspaceSlug={workspaceSlug}
            findings={needsAttention}
            developer={mode === "developer"}
          />
        </>
      ) : null}
      <h2 className={styles.sectionTitle}>Projects</h2>
      {projects.length === 0 ? (
        <p className={styles.pageSub}>No projects yet. Projects appear here once created.</p>
      ) : (
        <ul className={styles.rows}>
          {projects.map((project) => {
            const scans = scansByProject.get(project.id) ?? [];
            const findings = findingsByProject.get(project.id) ?? [];
            const open = findings.filter((finding) =>
              ["open", "in_progress", "pending_verification", "reopened"].includes(
                finding.remediationStatus,
              ),
            ).length;
            return (
              <li key={project.id} className={styles.row}>
                <span className={styles.rowMain}>
                  <Link
                    href={appPaths.projectOverview(workspaceSlug, project.id)}
                    className={styles.rowTitle}
                  >
                    {project.name}
                  </Link>
                  <span className={styles.rowMeta}>
                    {scans.length} {scans.length === 1 ? "scan" : "scans"} · {open} open{" "}
                    {open === 1 ? "finding" : "findings"}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <h2 className={styles.sectionTitle}>Recent scans</h2>
      <ScanList
        workspaceSlug={workspaceSlug}
        items={[...scansByProject.entries()].flatMap(([pid, scans]) =>
          scans.slice(0, 5).map((scan) => ({ scan, projectId: pid })),
        )}
        newScanHref={appPaths.projects(workspaceSlug)}
      />
    </div>
  );
}

export interface ProjectOverviewData {
  project: {
    id: string;
    slug: string;
    name: string;
    description?: string | null;
    lifecycle: string;
  };
  target: { label: string; canonicalOrigin: string; state: string } | null;
  environment: {
    label: string;
    currentRevision: string;
    provisionStatus: string;
    fixtureVersion: string;
  } | null;
  scope: {
    status: "active" | "revoked" | "expired";
    allowedHosts: string[];
    allowedPaths: string[];
    allowedTestPackIds: string[];
    allowedMethods: string[];
    expiresAt: string;
  } | null;
  readiness: ReadinessItem[];
  scans: ScanSummary[];
  findings: Finding[];
}

export function ProjectOverview({
  workspaceSlug,
  mode,
  data,
}: {
  workspaceSlug: string;
  mode: ExperienceMode;
  data: ProjectOverviewData;
}) {
  const { project } = data;
  const activeScan = data.scans.find((scan) =>
    ["queued", "preparing", "recon", "planning", "executing", "verifying", "finalizing"].includes(
      scan.status,
    ),
  );
  return (
    <div>
      <span className={styles.demoRibbon}>Controlled demo · synthetic users and records</span>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.pageTitle}>{project.name}</h1>
          {project.description ? <p className={styles.pageSub}>{project.description}</p> : null}
        </div>
        <div className={styles.headerActions}>
          <Link className={styles.cta} href={appPaths.newScan(workspaceSlug, project.id)}>
            New assessment
          </Link>
          <Link
            className={styles.secondaryCta}
            href={appPaths.scopePolicy(workspaceSlug, project.id)}
          >
            Scope & policy
          </Link>
        </div>
      </div>
      {activeScan ? (
        <ActiveScanBanner workspaceSlug={workspaceSlug} projectId={project.id} scan={activeScan} />
      ) : null}
      <CountsRow scans={data.scans} findings={data.findings} />
      <div className={styles.grid}>
        <Panel>
          <PanelHeader title="Test setup" />
          <PanelBody>
            <dl className={styles.checklist}>
              <div className={styles.check} data-ok={data.target?.state === "verified"}>
                <span className={styles.checkMark} aria-hidden="true">
                  {data.target?.state === "verified" ? "✓" : "!"}
                </span>
                <span>
                  <strong>Target</strong>
                  <span className={styles.rowMeta}>
                    {" "}
                    —{" "}
                    {data.target
                      ? `${data.target.label} · ${data.target.canonicalOrigin} · ${data.target.state}`
                      : "no target registered"}
                  </span>
                </span>
              </div>
              <div className={styles.check} data-ok={data.environment?.provisionStatus === "ready"}>
                <span className={styles.checkMark} aria-hidden="true">
                  {data.environment?.provisionStatus === "ready" ? "✓" : "!"}
                </span>
                <span>
                  <strong>Environment</strong>
                  <span className={styles.rowMeta}>
                    {" "}
                    —{" "}
                    {data.environment
                      ? `${data.environment.label} · ${data.environment.currentRevision} · ${data.environment.provisionStatus}`
                      : "no environment registered"}
                  </span>
                </span>
              </div>
            </dl>
          </PanelBody>
        </Panel>
        {data.scope ? (
          <ScopeSummaryPanel scope={data.scope} />
        ) : (
          <Panel>
            <PanelHeader title="Authorized scope" />
            <PanelBody>
              <p className={styles.note}>
                No approved scope recorded for this project. Scans stay queued until a scope is
                approved.
              </p>
            </PanelBody>
          </Panel>
        )}
      </div>
      <ReadinessChecklist items={data.readiness} />
      <h2 className={styles.sectionTitle}>Recent scans</h2>
      <ScanList
        workspaceSlug={workspaceSlug}
        items={data.scans.map((scan) => ({ scan, projectId: project.id }))}
        newScanHref={appPaths.newScan(workspaceSlug, project.id)}
      />
      <h2 className={styles.sectionTitle}>{mode === "builder" ? "Issues found" : "Findings"}</h2>
      <FindingList
        workspaceSlug={workspaceSlug}
        findings={data.findings}
        developer={mode === "developer"}
      />
    </div>
  );
}
