import { cookies, headers } from "next/headers";
import { DashboardApiError, getApiBase, getWorkspaces } from "@/features/dashboard/api";
import { FailedPanel } from "@/features/dashboard/panels";
import { BuilderOnboarding } from "@/features/builder/Onboarding";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  return { title: `Add a site · ${workspaceSlug} · HighCastle` };
}

/**
 * Builder onboarding — enter a URL, prove site control (DNS TXT or
 * well-known file), grant explicit permitted-path consent, run strictly
 * passive recon. Real API calls only; verification/permission gating is
 * enforced server-side (this page cannot widen scope).
 */
export default async function BuilderOnboardingPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  try {
    const baseUrl = await getApiBase();
    const workspaces = await getWorkspaces(fetch, { baseUrl, cookieHeader });
    const workspace = workspaces.find((w) => w.slug === workspaceSlug);
    if (!workspace) {
      return (
        <FailedPanel
          title="Workspace unavailable"
          message="The workspace could not be resolved — sign in with an account that is a member."
          retryHref={`/app/w/${workspaceSlug}/builder`}
        />
      );
    }
    return <BuilderOnboarding workspaceId={workspace.id} />;
  } catch (err) {
    const detail = err instanceof DashboardApiError ? err.message : "The API could not be reached.";
    return (
      <FailedPanel
        title="Onboarding unavailable"
        message={detail}
        retryHref={`/app/w/${workspaceSlug}/builder`}
      />
    );
  }
}
