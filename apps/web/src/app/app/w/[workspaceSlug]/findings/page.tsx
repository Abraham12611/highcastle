import Link from "next/link";
import { cookies, headers } from "next/headers";
import { EmptyState } from "@highcastle/ui";
import {
  DashboardApiError,
  getApiBase,
  getProjects,
  getProjectFindings,
  getWorkspaces,
  type Finding,
} from "@/features/dashboard/api";
import { MODE_COOKIE, resolveMode } from "@/features/dashboard/mode";
import { appPaths } from "@/features/dashboard/nav";
import { FailedPanel, UnauthorizedPanel } from "@/features/dashboard/panels";
import { PageCrumbs } from "@/features/dashboard/shell";
import { FindingCard } from "@/features/findings/components/FindingCard";
import styles from "@/features/dashboard/panels.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  return { title: `Findings · ${workspaceSlug} · HighCastle` };
}

const SEVERITIES = ["critical", "high", "medium", "low", "informational"] as const;
const STATUSES = [
  "open",
  "in_progress",
  "pending_verification",
  "verified_fixed",
  "accepted_risk",
  "dismissed",
  "reopened",
] as const;

interface Row extends Finding {
  projectName: string;
}

/**
 * Workspace finding index — every finding across workspace projects.
 * Filters are plain links (server-rendered, no client state); filtering
 * never changes evidence, only visible rows.
 */
export default async function WorkspaceFindingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ severity?: string; status?: string }>;
}) {
  const { workspaceSlug } = await params;
  const { severity, status } = await searchParams;
  void resolveMode((await cookies()).get(MODE_COOKIE)?.value);
  const pathname = `/app/w/${workspaceSlug}/findings`;

  let data: Awaited<ReturnType<typeof load>> | { error: DashboardApiError };
  try {
    data = await load(workspaceSlug);
  } catch (error) {
    data = { error: error as DashboardApiError };
  }

  if ("error" in data) {
    if (data.error.isUnauthorized) {
      return (
        <UnauthorizedPanel
          returnTo={pathname}
          reason={data.error.status === 401 ? "signed-out" : "no-access"}
        />
      );
    }
    return (
      <FailedPanel
        title="Findings unavailable"
        message={data.error.message}
        requestId={data.error.requestId}
        retryHref={pathname}
      />
    );
  }

  const activeSeverity = SEVERITIES.includes(severity as (typeof SEVERITIES)[number])
    ? severity!
    : "all";
  const activeStatus = STATUSES.includes(status as (typeof STATUSES)[number]) ? status! : "all";
  const rows = data.rows.filter(
    (row) =>
      (activeSeverity === "all" || row.severity === activeSeverity) &&
      (activeStatus === "all" || row.remediationStatus === activeStatus),
  );
  const hrefFor = (sev: string, st: string) => {
    const query = new URLSearchParams();
    if (sev !== "all") query.set("severity", sev);
    if (st !== "all") query.set("status", st);
    const suffix = query.toString();
    return suffix ? `${pathname}?${suffix}` : pathname;
  };

  return (
    <>
      <PageCrumbs
        items={[
          { label: data.workspaceName, href: appPaths.overview(workspaceSlug) },
          { label: "Findings" },
        ]}
      />
      <h1 className={styles.pageTitle}>Findings</h1>
      <p className={styles.pageSub}>
        {rows.length} of {data.rows.length}{" "}
        {data.rows.length === 1 ? "finding" : "findings"} shown.
      </p>
      <nav aria-label="Severity filter">
        <ul style={{ display: "flex", gap: 8, listStyle: "none", padding: 0, flexWrap: "wrap" }}>
          <li>
            <Link
              href={hrefFor("all", activeStatus)}
              aria-current={activeSeverity === "all" ? "page" : undefined}
            >
              All severities
            </Link>
          </li>
          {SEVERITIES.map((sev) => (
            <li key={sev}>
              <Link
                href={hrefFor(sev, activeStatus)}
                aria-current={activeSeverity === sev ? "page" : undefined}
              >
                {sev}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <nav aria-label="Status filter">
        <ul style={{ display: "flex", gap: 8, listStyle: "none", padding: 0, flexWrap: "wrap" }}>
          <li>
            <Link
              href={hrefFor(activeSeverity, "all")}
              aria-current={activeStatus === "all" ? "page" : undefined}
            >
              All statuses
            </Link>
          </li>
          {STATUSES.map((st) => (
            <li key={st}>
              <Link
                href={hrefFor(activeSeverity, st)}
                aria-current={activeStatus === st ? "page" : undefined}
              >
                {st.replaceAll("_", " ")}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {rows.length === 0 ? (
        <EmptyState title="No findings match">
          {data.rows.length === 0
            ? "Findings appear here once a scan confirms one — only oracle-verified results are listed, never model guesses."
            : "Try widening the filters."}
        </EmptyState>
      ) : (
        <ul className={styles.rows}>
          {rows.map((row) => (
            <li key={row.id} className={styles.row}>
              <span className={styles.rowMeta}>{row.projectName}</span>
              <FindingCard
                workspaceSlug={workspaceSlug}
                projectId={row.projectId}
                finding={{
                  id: row.id,
                  title: row.title,
                  category: row.category,
                  severity: row.severity,
                  confidence: row.confidence,
                  remediationStatus: row.remediationStatus,
                  firstSeenAt: row.firstSeenAt,
                  lastSeenAt: row.lastSeenAt,
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

async function load(workspaceSlug: string) {
  const headerStore = await headers();
  const cookieHeader = headerStore.get("cookie");
  const baseUrl = await getApiBase();
  const workspaces = await getWorkspaces(fetch, { baseUrl, cookieHeader });
  const workspace = workspaces.find((w) => w.slug === workspaceSlug);
  if (!workspace) {
    throw new DashboardApiError(404, "Workspace not found", "not_found");
  }
  const projects = await getProjects(fetch, { baseUrl, cookieHeader }, workspace.id);
  const rows: Row[] = [];
  for (const project of projects) {
    const findings = await getProjectFindings(fetch, { baseUrl, cookieHeader }, project.id);
    for (const finding of findings) {
      rows.push({ ...finding, projectName: project.name });
    }
  }
  return { workspaceName: workspace.name, rows };
}
