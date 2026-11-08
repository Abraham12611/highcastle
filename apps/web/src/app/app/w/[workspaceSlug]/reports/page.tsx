import { appPaths } from "@/features/dashboard/nav";
import { PageCrumbs } from "@/features/dashboard/shell";
import { ComingSoon } from "@/features/dashboard/coming-soon";
import styles from "@/features/dashboard/panels.module.css";

export const metadata = { title: "Reports · HighCastle" };

/** Reports — ships with the reporting lane. */
export default async function ReportsPage({
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
          { label: "Reports" },
        ]}
      />
      <h1 className={styles.pageTitle}>Reports</h1>
      <ComingSoon title="Coverage reports" owner="the reporting lane">
        Exportable coverage and trend reports are not implemented — evidence
        lives on findings and attempts today.
      </ComingSoon>
    </>
  );
}
