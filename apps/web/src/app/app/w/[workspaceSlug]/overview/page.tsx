import { cookies, headers } from "next/headers";
import {
  DashboardApiError,
  getApiBase,
  getProjectFindings,
  getProjectScans,
  getProjects,
  getWorkspaces,
  type Finding,
  type ScanSummary,
} from "@/features/dashboard/api";
import { MODE_COOKIE, resolveMode } from "@/features/dashboard/mode";
import { WorkspaceOverview } from "@/features/dashboard/overview";
import { FailedPanel, UnauthorizedPanel } from "@/features/dashboard/panels";
import { PageCrumbs } from "@/features/dashboard/shell";
import { appPaths } from "@/features/dashboard/nav";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  return { title: `${workspaceSlug} overview · HighCastle` };
}

/** Workspace overview (H-03) — counts and lists from real API rows only. */
export default async function WorkspaceOverviewPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const cookieStore = await cookies();
  const mode = resolveMode(cookieStore.get(MODE_COOKIE)?.value);
  const pathname = `/app/w/${workspaceSlug}/overview`;

  let data: Awaited<ReturnType<typeof load>> | { error: DashboardApiError };
  try {
    data = await load(workspaceSlug);
  } catch (error) {
    data = { error: error as DashboardApiError };
  }

  if ("error" in data) {
    const { error } = data;
    if (error.isUnauthorized) {
      return (
        <UnauthorizedPanel
          returnTo={pathname}
          reason={error.status === 401 ? "signed-out" : "no-access"}
        />
      );
    }
    return (
      <FailedPanel
        title="Workspace overview unavailable"
        message={error.message}
        requestId={error.requestId}
        retryHref={pathname}
      />
    );
  }

  return (
    <>
      <PageCrumbs
        items={[
          { label: data.workspaceName, href: appPaths.overview(workspaceSlug) },
          { label: "Overview" },
        ]}
      />
      <WorkspaceOverview
        workspaceSlug={workspaceSlug}
        workspaceName={data.workspaceName}
        mode={mode}
        projects={data.projects}
        scansByProject={data.scansByProject}
        findingsByProject={data.findingsByProject}
      />
    </>
  );

  async function load(slug: string) {
    const headerCookie = (await headers()).get("cookie");
    const baseUrl = await getApiBase();
    const options = { baseUrl, cookieHeader: headerCookie };
    const workspaces = await getWorkspaces(fetch, options);
    const workspace = workspaces.find((candidate) => candidate.slug === slug);
    if (!workspace) {
      throw new DashboardApiError(404, "Workspace not found.");
    }
    const projects = await getProjects(fetch, options, workspace.id);
    const scansByProject = new Map<string, ScanSummary[]>();
    const findingsByProject = new Map<string, Finding[]>();
    await Promise.all(
      projects.map(async (project) => {
        const [scans, findings] = await Promise.all([
          getProjectScans(fetch, options, project.id).catch(() => []),
          getProjectFindings(fetch, options, project.id).catch(() => []),
        ]);
        scansByProject.set(project.id, scans);
        findingsByProject.set(project.id, findings);
      }),
    );
    return {
      workspaceName: workspace.name,
      projects: projects.map((project) => ({
        id: project.id,
        slug: project.slug,
        name: project.name,
      })),
      scansByProject,
      findingsByProject,
    };
  }
}
