import { appPaths } from "@/features/dashboard/nav";
import { PageCrumbs } from "@/features/dashboard/shell";
import { ComingSoon } from "@/features/dashboard/coming-soon";
import styles from "@/features/dashboard/panels.module.css";

export const metadata = { title: "API keys · HighCastle" };

/** Developer API keys — must never exist until the auth lane builds them. */
export default async function ApiKeysPage({
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
          { label: "API keys" },
        ]}
      />
      <h1 className={styles.pageTitle}>API keys</h1>
      <ComingSoon title="Personal API keys" owner="E5 (auth lane)">
        No user API keys can be minted here — server secrets stay
        server-side only.
      </ComingSoon>
    </>
  );
}
