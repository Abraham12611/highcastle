import { appPaths } from "@/features/dashboard/nav";
import { PageCrumbs } from "@/features/dashboard/shell";
import { ComingSoon } from "@/features/dashboard/coming-soon";
import styles from "@/features/dashboard/panels.module.css";

export const metadata = { title: "Fixes & Replays · HighCastle" };

/** Fixes & replays index — ships with the replay-history lane. */
export default async function RemediationsPage({
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
          { label: "Fixes & Replays" },
        ]}
      />
      <h1 className={styles.pageTitle}>Fixes &amp; Replays</h1>
      <ComingSoon title="Replay history" owner="the replay-history lane">
        Per-finding replay timelines live on each finding&apos;s replay tab
        today; this cross-project index arrives with that lane.
      </ComingSoon>
    </>
  );
}
