import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { EmptyState } from "@highcastle/ui";
import { getApiBase, getWorkspaces } from "@/features/dashboard/api";
import { MODE_COOKIE, resolveMode } from "@/features/dashboard/mode";
import { appPaths } from "@/features/dashboard/nav";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Your workspaces · HighCastle",
};

/**
 * `/app` index: redirect to the first accessible workspace. With no
 * workspaces (or an unreachable API) render an honest empty state — never
 * a fabricated destination.
 */
export default async function AppIndexPage() {
  const cookieStore = await cookies();
  resolveMode(cookieStore.get(MODE_COOKIE)?.value);
  const headerStore = await headers();
  let slugs: string[] = [];
  try {
    const baseUrl = await getApiBase();
    const workspaces = await getWorkspaces(fetch, {
      baseUrl,
      cookieHeader: headerStore.get("cookie"),
    });
    slugs = workspaces.map((workspace) => workspace.slug);
  } catch {
    slugs = [];
  }
  if (slugs.length > 0) {
    redirect(appPaths.overview(slugs[0]!));
  }
  return (
    <main style={{ padding: "48px 24px", maxWidth: 640, margin: "0 auto" }}>
      <EmptyState title="No workspaces available">
        The dashboard could not list any workspaces for this session. If an API outage is in
        progress, wait and reload — workspaces appear here once the service responds.
      </EmptyState>
    </main>
  );
}
