import { appPaths } from "@/features/dashboard/nav";
import { PageCrumbs } from "@/features/dashboard/shell";
import { ComingSoon } from "@/features/dashboard/coming-soon";
import styles from "@/features/dashboard/panels.module.css";

export const metadata = { title: "Automation · HighCastle" };

/** Automation — no webhooks or scheduled scans are claimed until built. */
export default async function AutomationPage({
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
          { label: "Automation" },
        ]}
      />
      <h1 className={styles.pageTitle}>Automation</h1>
      <ComingSoon title="Schedules and webhooks" owner="a future automation lane">
        No scheduled scans, PR checks, or outbound webhooks exist — nothing
        here runs on its own today.
      </ComingSoon>
    </>
  );
}
