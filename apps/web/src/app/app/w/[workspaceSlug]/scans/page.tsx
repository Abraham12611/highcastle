import Link from "next/link";
import { cookies, headers } from "next/headers";
import { EmptyState } from "@highcastle/ui";
import {
  DashboardApiError,
  getApiBase,
  getProjects,
  getProjectScans,
  getWorkspaces,
  type ScanSummary,
} from "@/features/dashboard/api";
import { MODE_COOKIE, resolveMode } from "@/features/dashboard/mode";
import { appPaths } from "@/features/dashboard/nav";
import { FailedPanel, UnauthorizedPanel } from "@/features/dashboard/panels";
import { PageCrumbs } from "@/features/dashboard/shell";
import styles from "@/features/dashboard/panels.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  return { title: `Scans · ${workspaceSlug} · HighCastle` };
}

type ScanTab = "all" | "deep" | "fix" | "recon" | "pr";

const TABS: { key: ScanTab; label: string; ready: boolean; note?: string }[] = [
  { key: "all", label: "All", ready: true },
  { key: "deep", label: "Deep", ready: false, note: "Scan-class filtering needs the scan-type field on the BFF list response — coming with the L18 list upgrade." },
  { key: "fix", label: "Fix", ready: false, note: "Replay-verification filtering needs the scan-type field on the BFF list response." },
  { key: "recon", label: "Recon", ready: false, note: "Baseline-check filtering needs the scan-type field on the BFF list response." },
  { key: "pr", label: "PR", ready: false, note: "PR webhook scans do not exist yet — no automatic PR checks are claimed." },
];

interface Row extends ScanSummary {
  projectId: string;
  projectName: string;
}

/**
 * Workspace scan index — every scan across workspace projects, newest
 * first. Only the All tab reads live data; class tabs stay disabled with
 * the reason stated (the summary contract carries no scan-type field).
 */
export default async function WorkspaceScansPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { workspaceSlug } = await params;
  const { tab } = await searchParams;
  void resolveMode((await cookies()).get(MODE_COOKIE)?.value);
  const pathname = `/app/w/${workspaceSlug}/scans`;

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
        title="Scans unavailable"
        message={data.error.message}
        requestId={data.error.requestId}
        retryHref={pathname}
      />
    );
  }

  const active: ScanTab =
    tab === "deep" || tab === "fix" || tab === "recon" || tab === "pr" ? tab : "all";
  const activeNote = TABS.find((t) => t.key === active)?.note;
  const rows = data.rows;

  return (
    <>
      <PageCrumbs
        items={[
          { label: data.workspaceName, href: appPaths.overview(workspaceSlug) },
          { label: "Scans" },
        ]}
      />
      <h1 className={styles.pageTitle}>Scans</h1>
      <p className={styles.pageSub}>
        {rows.length} {rows.length === 1 ? "scan" : "scans"} across{" "}
        {data.projectCount} {data.projectCount === 1 ? "project" : "projects"}.
      </p>
      <nav aria-label="Scan classes">
        <ul style={{ display: "flex", gap: 8, listStyle: "none", padding: 0 }}>
          {TABS.map((t) =>
            t.ready ? (
              <li key={t.key}>
                <Link
                  href={`${pathname}?tab=${t.key}`}
                  aria-current={active === t.key ? "page" : undefined}
                >
                  {t.label}
                </Link>
              </li>
            ) : (
              <li key={t.key}>
                <button type="button" disabled title={t.note}>
                  {t.label} · soon
                </button>
              </li>
            ),
          )}
        </ul>
      </nav>
      {active !== "all" && activeNote ? <p role="note">{activeNote}</p> : null}
      {rows.length === 0 ? (
        <EmptyState title="No scans yet">
          Scans appear here once an assessment runs. Start one from a
          project, or run the controlled demo — no fake history is shown.
        </EmptyState>
      ) : (
        <ul className={styles.rows}>
          {rows.map((row) => (
            <li key={row.scanId} className={styles.row}>
              <span className={styles.rowMain}>
                <Link href={`/app/scans/${row.scanId}`} className={styles.rowTitle}>
                  Scan {row.scanId.slice(0, 8)}
                </Link>
                <span className={styles.rowMeta}>
                  {row.projectName} · {row.status.replaceAll("_", " ")}
                  {row.phase ? ` · ${row.phase}` : ""} ·{" "}
                  {row.executedCount}/{row.plannedCount} checks ·{" "}
                  {row.confirmedCount} confirmed
                </span>
              </span>
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
    const scans = await getProjectScans(fetch, { baseUrl, cookieHeader }, project.id);
    for (const scan of scans) {
      rows.push({ ...scan, projectId: project.id, projectName: project.name });
    }
  }
  return { workspaceName: workspace.name, projectCount: projects.length, rows };
}
