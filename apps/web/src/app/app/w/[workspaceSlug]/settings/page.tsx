import { cookies, headers } from "next/headers";
import {
  DashboardApiError,
  getApiBase,
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
  return { title: `Settings · ${workspaceSlug} · HighCastle` };
}

/**
 * Workspace settings — General (real workspace + session facts), Team /
 * Security / Account (Coming Soon: invites, billing, and credential
 * management do not exist yet and are never implied live).
 */
export default async function WorkspaceSettingsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const mode = resolveMode((await cookies()).get(MODE_COOKIE)?.value);
  const pathname = `/app/w/${workspaceSlug}/settings`;

  let data: Awaited<ReturnType<typeof load>> | { error: DashboardApiError };
  try {
    data = await load();
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
        title="Settings unavailable"
        message={data.error.message}
        requestId={data.error.requestId}
        retryHref={pathname}
      />
    );
  }

  const workspace = data.workspaces.find((w) => w.slug === workspaceSlug);

  return (
    <>
      <PageCrumbs
        items={[
          { label: workspace?.name ?? workspaceSlug, href: appPaths.overview(workspaceSlug) },
          { label: "Settings" },
        ]}
      />
      <h1 className={styles.pageTitle}>Settings</h1>
      <section aria-labelledby="set-general">
        <h2 id="set-general">General</h2>
        <dl>
          <dt>Workspace</dt>
          <dd>{workspace?.name ?? workspaceSlug}</dd>
          <dt>Slug</dt>
          <dd>{workspaceSlug}</dd>
          <dt>Experience mode</dt>
          <dd>{mode} (presentation preference only)</dd>
          <dt>Session</dt>
          <dd>
            {data.sessionKind === "demo"
              ? "Limited guest session — server-issued, synthetic lab only."
              : "Account session."}
          </dd>
        </dl>
      </section>
      <section aria-labelledby="set-team">
        <h2 id="set-team">Team</h2>
        <ComingSoon title="Team invites" owner="a future accounts lane">
          Membership, roles, and invites are not implemented — no one can
          be invited from this page today.
        </ComingSoon>
      </section>
      <section aria-labelledby="set-security">
        <h2 id="set-security">Security</h2>
        <ComingSoon title="Security settings" owner="E5 (auth lane)">
          Credential rotation, session revocation, and audit exports land
          with the account-auth build.
        </ComingSoon>
      </section>
      <section aria-labelledby="set-account">
        <h2 id="set-account">Account</h2>
        <ComingSoon title="Billing and plans" owner="a future accounts lane">
          There is no billing, no plans page, and no paid tier — nothing
          here can charge you.
        </ComingSoon>
      </section>
    </>
  );
}

async function load() {
  const headerStore = await headers();
  const cookieHeader = headerStore.get("cookie");
  const baseUrl = await getApiBase();
  const workspaces = await getWorkspaces(fetch, { baseUrl, cookieHeader });
  const meRes = await fetch(`${baseUrl}/api/v1/me`, {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  });
  let sessionKind = "account";
  try {
    const body = (await meRes.json()) as {
      data?: { session?: { kind?: string } };
    };
    if (body.data?.session?.kind === "demo") sessionKind = "demo";
  } catch {
    sessionKind = "unknown";
  }
  return { workspaces, sessionKind };
}
