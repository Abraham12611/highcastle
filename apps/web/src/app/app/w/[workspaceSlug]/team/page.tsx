import { appPaths } from "@/features/dashboard/nav";
import { PageCrumbs } from "@/features/dashboard/shell";
import { ComingSoon } from "@/features/dashboard/coming-soon";
import styles from "@/features/dashboard/panels.module.css";

export const metadata = { title: "Team · HighCastle" };

/** Team — membership management does not exist yet. */
export default async function TeamPage({
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
          { label: "Team" },
        ]}
      />
      <h1 className={styles.pageTitle}>Team</h1>
      <ComingSoon title="Team management" owner="a future accounts lane">
        Roles and invites are not implemented — workspace access is governed
        by the session today.
      </ComingSoon>
    </>
  );
}
