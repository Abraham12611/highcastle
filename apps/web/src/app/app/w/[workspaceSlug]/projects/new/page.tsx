import { appPaths } from "@/features/dashboard/nav";
import { PageCrumbs } from "@/features/dashboard/shell";
import { ComingSoon } from "@/features/dashboard/coming-soon";
import styles from "@/features/dashboard/panels.module.css";

export const metadata = { title: "New project · HighCastle" };

/**
 * Project creation — needs the E9 (GitHub source) and E10 (verified URL)
 * flows first. Until then: run the controlled demo, which provisions its
 * own synthetic project server-side.
 */
export default async function NewProjectPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  return (
    <>
      <PageCrumbs
        items={[
          { label: workspaceSlug, href: appPaths.overview(workspaceSlug) },
          { label: "Projects", href: appPaths.projects(workspaceSlug) },
          { label: "New" },
        ]}
      />
      <h1 className={styles.pageTitle}>New project</h1>
      <ComingSoon title="Project creation" owner="E9 + E10 (source lanes)">
        A project pairs a source snapshot with an authorized target, and
        both onboarding paths are still being built. The controlled demo
        remains the working path today.
      </ComingSoon>
    </>
  );
}
