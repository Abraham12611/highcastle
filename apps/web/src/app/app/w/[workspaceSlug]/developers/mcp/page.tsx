import { appPaths } from "@/features/dashboard/nav";
import { PageCrumbs } from "@/features/dashboard/shell";
import { ComingSoon } from "@/features/dashboard/coming-soon";
import styles from "@/features/dashboard/panels.module.css";

export const metadata = { title: "MCP · HighCastle" };

/** MCP surface — explicitly future. */
export default async function McpPage({
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
          { label: "MCP" },
        ]}
      />
      <h1 className={styles.pageTitle}>MCP</h1>
      <ComingSoon title="Model Context Protocol" owner="a future tools lane">
        No MCP server or tool bindings exist — the agent acts only through
        the reviewed worker queue.
      </ComingSoon>
    </>
  );
}
