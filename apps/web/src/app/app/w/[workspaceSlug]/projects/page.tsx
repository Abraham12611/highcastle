import Link from "next/link";
import { cookies, headers } from "next/headers";
import { EmptyState } from "@highcastle/ui";
import {
  DashboardApiError,
  getApiBase,
  getProjects,
  getWorkspaces,
} from "@/features/dashboard/api";
import { MODE_COOKIE, resolveMode } from "@/features/dashboard/mode";
import { appPaths } from "@/features/dashboard/nav";
import { FailedPanel, UnauthorizedPanel } from "@/features/dashboard/panels";
import { PageCrumbs } from "@/features/dashboard/shell";
import styles from "@/features/dashboard/panels.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  return { title: `Projects · ${workspaceSlug} · HighCastle` };
}

/** Workspace project index — real project rows with per-project links. */
export default async function ProjectsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  void resolveMode((await cookies()).get(MODE_COOKIE)?.value);
  const pathname = `/app/w/${workspaceSlug}/projects`;

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
        title="Projects unavailable"
        message={data.error.message}
        requestId={data.error.requestId}
        retryHref={pathname}
      />
    );
  }

  return (
    <>
      <PageCrumbs
        items={[
          { label: data.workspaceName, href: appPaths.overview(workspaceSlug) },
          { label: "Projects" },
        ]}
      />
      <h1 className={styles.pageTitle}>Projects</h1>
      <p className={styles.pageSub}>
        {data.projects.length} {data.projects.length === 1 ? "project" : "projects"} in{" "}
        {data.workspaceName}.
      </p>
      {data.projects.length === 0 ? (
        <EmptyState title="No projects yet">
          Projects appear here once created. A project pairs a source snapshot with an authorized
          test target — never an arbitrary URL.
        </EmptyState>
      ) : (
        <ul className={styles.rows}>
          {data.projects.map((project) => (
            <li key={project.id} className={styles.row}>
              <span className={styles.rowMain}>
                <Link
                  href={appPaths.projectOverview(workspaceSlug, project.id)}
                  className={styles.rowTitle}
                >
                  {project.name}
                </Link>
                <span className={styles.rowMeta}>
                  {project.kind} · {project.lifecycle.replaceAll("_", " ")}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  async function load(slug: string) {
    const headerCookie = (await headers()).get("cookie");
    const baseUrl = await getApiBase();
    const options = { baseUrl, cookieHeader: headerCookie };
    const workspaces = await getWorkspaces(fetch, options);
    const workspace = workspaces.find((candidate) => candidate.slug === slug);
    if (!workspace) throw new DashboardApiError(404, "Workspace not found.");
    const projects = await getProjects(fetch, options, workspace.id);
    return { workspaceName: workspace.name, projects };
  }
}
