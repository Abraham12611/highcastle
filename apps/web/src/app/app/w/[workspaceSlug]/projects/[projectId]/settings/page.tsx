import { appPaths } from "@/features/dashboard/nav";
import { PageCrumbs } from "@/features/dashboard/shell";
import { ComingSoon } from "@/features/dashboard/coming-soon";
import styles from "@/features/dashboard/panels.module.css";

export const metadata = { title: "Project settings · HighCastle" };

/** Per-project settings — ships with the source/target management lanes. */
export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;
  return (
    <>
      <PageCrumbs
        items={[
          { label: workspaceSlug, href: appPaths.overview(workspaceSlug) },
          { label: "Projects", href: appPaths.projects(workspaceSlug) },
          {
            label: "Settings",
          },
        ]}
      />
      <h1 className={styles.pageTitle}>Project settings</h1>
      <ComingSoon title="Project settings" owner="E9 + E10 (source lanes)">
        Source revisions, target environments, and scope policy for project{" "}
        {projectId.slice(0, 8)} are managed by their owning lanes; per-project
        editing is not live yet.
      </ComingSoon>
    </>
  );
}
