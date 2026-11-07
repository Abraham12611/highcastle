import { cookies, headers } from "next/headers";
import type { ReactNode } from "react";
import { getApiBase, getWorkspaces } from "@/features/dashboard/api";
import { MODE_COOKIE, resolveMode } from "@/features/dashboard/mode";
import { getWorkspaceSections } from "@/features/dashboard/nav";
import { DashboardShell } from "@/features/dashboard/shell";

export const dynamic = "force-dynamic";

/**
 * Protected workspace shell (L08 owns this frame).
 *
 * Every `/app/w/:workspaceSlug/*` page — including L09 scan pages and L10
 * finding pages — nests inside this layout and inherits the rail, top bar,
 * mode switch and breadcrumb contract. Unknown workspaces render the
 * no-access panel (never a leak, never a redirect loop).
 */
export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const cookieStore = await cookies();
  const mode = resolveMode(cookieStore.get(MODE_COOKIE)?.value);
  const headerStore = await headers();
  const baseUrl = await getApiBase();
  const cookieHeader = headerStore.get("cookie");

  // The rail must render even when the workspace list fails: an empty
  // switcher plus per-page failed/unauthorized panels keeps the shell honest
  // without leaking which slugs exist.
  let workspaces: { slug: string; name: string }[] = [];
  try {
    workspaces = await getWorkspaces(fetch, { baseUrl, cookieHeader });
  } catch {
    workspaces = [];
  }
  const current = workspaces.find((workspace) => workspace.slug === workspaceSlug);
  const sections = getWorkspaceSections(workspaceSlug, mode);

  return (
    <DashboardShell
      workspaceName={current?.name ?? workspaceSlug}
      workspaceSlug={workspaceSlug}
      workspaces={workspaces}
      mode={mode}
      sections={sections}
      navLabel="Workspace"
    >
      {children}
    </DashboardShell>
  );
}
