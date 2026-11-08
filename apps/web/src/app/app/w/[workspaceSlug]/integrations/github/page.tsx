import { cookies, headers } from "next/headers";
import { EmptyState } from "@highcastle/ui";
import {
  DashboardApiError,
  getApiBase,
  getProjects,
  getProjectTargets,
  getWorkspaces,
} from "@/features/dashboard/api";
import { MODE_COOKIE, resolveMode } from "@/features/dashboard/mode";
import { appPaths } from "@/features/dashboard/nav";
import { FailedPanel, UnauthorizedPanel } from "@/features/dashboard/panels";
import { PageCrumbs } from "@/features/dashboard/shell";
import { ComingSoon } from "@/features/dashboard/coming-soon";
import styles from "@/features/dashboard/panels.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  return { title: `GitHub integration · ${workspaceSlug} · HighCastle` };
}

/**
 * Integrations → GitHub. Shows verified URL targets (real, per project)
 * and leaves the GitHub connection to the E9 lane: the connect action
 * does not exist yet, so it renders as Coming Soon — never a fake
 * connected state.
 */
export default async function GithubIntegrationPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  void resolveMode((await cookies()).get(MODE_COOKIE)?.value);
  const pathname = `/app/w/${workspaceSlug}/integrations/github`;

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
        title="Integrations unavailable"
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
          { label: "Integrations" },
          { label: "GitHub" },
        ]}
      />
      <h1 className={styles.pageTitle}>GitHub integration</h1>
      <section aria-labelledby="gh-connect">
        <h2 id="gh-connect">Repository connection</h2>
        <ComingSoon title="GitHub connection" owner="the E9 GitHub-connection lane">
          Read-only repo analysis and explicit commit pinning land with that
          lane&apos;s connect endpoint and repo picker (server-side OAuth
          credentials are already provisioned under E9-owned env names).
          No repositories are connected today.
        </ComingSoon>
      </section>
      <section aria-labelledby="gh-targets">
        <h2 id="gh-targets">Verified URL targets</h2>
        <p className={styles.pageSub}>
          {data.targets.length}{" "}
          {data.targets.length === 1 ? "target" : "targets"} across{" "}
          {data.projectCount} {data.projectCount === 1 ? "project" : "projects"}.
        </p>
        {data.targets.length === 0 ? (
          <EmptyState title="No verified targets">
            Targets appear here once an environment is verified for a
            project. New URL verification is the E10 lane&apos;s flow.
          </EmptyState>
        ) : (
          <ul className={styles.rows}>
            {data.targets.map((target) => (
              <li key={target.id} className={styles.row}>
                <span className={styles.rowMain}>
                  <span className={styles.rowTitle}>{target.label}</span>
                  <span className={styles.rowMeta}>
                    {target.projectName} · {target.canonicalOrigin} ·{" "}
                    {target.state.replaceAll("_", " ")}
                    {target.verifiedAt ? ` · verified ${target.verifiedAt}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
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
  const targets: {
    id: string;
    label: string;
    canonicalOrigin: string;
    state: string;
    verifiedAt: string | null;
    projectName: string;
  }[] = [];
  for (const project of projects) {
    const projectTargets = await getProjectTargets(fetch, { baseUrl, cookieHeader }, project.id);
    for (const target of projectTargets) {
      targets.push({
        id: target.id,
        label: target.label,
        canonicalOrigin: target.canonicalOrigin,
        state: target.state,
        verifiedAt: target.verifiedAt,
        projectName: project.name,
      });
    }
  }
  return { workspaceName: workspace.name, projectCount: projects.length, targets };
}
