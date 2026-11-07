import { cookies, headers } from "next/headers";
import {
  DashboardApiError,
  getApiBase,
  getCurrentScope,
  getPreflight,
  getProject,
  getProjectEnvironments,
  getProjectFindings,
  getProjectScans,
  getProjectTargets,
  getWorkspaces,
  type Environment,
  type Target,
} from "@/features/dashboard/api";
import { MODE_COOKIE, resolveMode } from "@/features/dashboard/mode";
import { appPaths } from "@/features/dashboard/nav";
import { ProjectOverview } from "@/features/dashboard/overview";
import { FailedPanel, UnauthorizedPanel } from "@/features/dashboard/panels";
import { PageCrumbs } from "@/features/dashboard/shell";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug } = await params;
  return { title: `Project · ${workspaceSlug} · HighCastle` };
}

/**
 * Project dashboard (H-04) — readiness, scope, environment, scans, findings.
 * Every panel below renders recorded API rows; a failed dependency renders
 * the failed panel for the whole page (partial panels would imply coverage
 * the dashboard cannot prove).
 */
export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;
  const cookieStore = await cookies();
  const mode = resolveMode(cookieStore.get(MODE_COOKIE)?.value);
  const pathname = `/app/w/${workspaceSlug}/projects/${projectId}/overview`;

  let data: Awaited<ReturnType<typeof load>> | { error: DashboardApiError };
  try {
    data = await load(workspaceSlug, projectId);
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
        title="Project overview unavailable"
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
          { label: "Projects", href: appPaths.projects(workspaceSlug) },
          { label: data.overview.project.name },
        ]}
      />
      <ProjectOverview workspaceSlug={workspaceSlug} mode={mode} data={data.overview} />
    </>
  );

  async function load(slug: string, pid: string) {
    const headerCookie = (await headers()).get("cookie");
    const baseUrl = await getApiBase();
    const options = { baseUrl, cookieHeader: headerCookie };
    const workspaces = await getWorkspaces(fetch, options);
    const workspace = workspaces.find((candidate) => candidate.slug === slug);
    if (!workspace) throw new DashboardApiError(404, "Workspace not found.");
    const project = await getProject(fetch, options, pid);
    if (project.workspaceId !== workspace.id) {
      // Same shape as missing — never confirm cross-tenant existence.
      throw new DashboardApiError(404, "Project not found.");
    }
    const [targets, environments, scope, scans, findings, preflight] = await Promise.all([
      getProjectTargets(fetch, options, pid).catch((): Target[] => []),
      getProjectEnvironments(fetch, options, pid).catch((): Environment[] => []),
      getCurrentScope(fetch, options, pid),
      getProjectScans(fetch, options, pid).catch(() => []),
      getProjectFindings(fetch, options, pid).catch(() => []),
      getPreflight(fetch, options, pid).catch(() => null),
    ]);
    const target = targets[0] ?? null;
    const environment =
      environments.find((env) => env.provisionStatus === "ready") ?? environments[0] ?? null;
    const scopeExpired = scope ? Date.parse(scope.expiresAt) <= Date.now() : false;
    return {
      workspaceName: workspace.name,
      overview: {
        project: {
          id: project.id,
          slug: project.slug,
          name: project.name,
          description: project.description,
          lifecycle: project.lifecycle,
        },
        target: target
          ? {
              label: target.label,
              canonicalOrigin: target.canonicalOrigin,
              state: target.state,
            }
          : null,
        environment: environment
          ? {
              label: environment.label,
              currentRevision: environment.currentRevision,
              provisionStatus: environment.provisionStatus,
              fixtureVersion: environment.fixtureVersion,
            }
          : null,
        scope: scope
          ? {
              status: scopeExpired ? ("expired" as const) : scope.status,
              allowedHosts: scope.allowedHosts,
              allowedPaths: scope.allowedPaths,
              allowedTestPackIds: scope.allowedTestPackIds,
              allowedMethods: scope.allowedMethods,
              expiresAt: scope.expiresAt,
            }
          : null,
        readiness: [
          {
            key: "target",
            label: "Target verified",
            ok: target?.state === "verified",
            detail: target ? `${target.label} · ${target.state}` : "no target registered",
          },
          {
            key: "environment",
            label: "Environment ready",
            ok: environment?.provisionStatus === "ready",
            detail: environment
              ? `${environment.label} · ${environment.currentRevision}`
              : "no environment registered",
          },
          {
            key: "scope",
            label: "Scope active",
            ok: !!scope && scope.status === "active" && !scopeExpired,
            detail: scope ? `v${scope.version} · expires ${scope.expiresAt}` : "no approved scope",
            href: appPaths.scopePolicy(slug, pid),
          },
          {
            key: "preflight",
            label: "Preflight",
            ok: preflight?.ok === true,
            detail: preflight
              ? preflight.ok
                ? preflight.checks.map((check) => check.name).join(", ")
                : `blocked: ${preflight.checks
                    .filter((check) => !check.passed)
                    .map((check) => check.name)
                    .join(", ")}`
              : "preflight unavailable",
          },
        ],
        scans,
        findings,
      },
    };
  }
}
