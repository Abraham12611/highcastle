import Link from "next/link";
import { notFound } from "next/navigation";
import { BlockedState, EmptyState, ErrorState } from "@highcastle/ui";
import { FindingList } from "@/features/findings/components/FindingList";
import { loadFindingList } from "@/features/findings/loader";
import styles from "@/features/findings/components/findings.module.css";
import { DEMO_FINDING_ID } from "@/features/findings/demo";

export default async function FindingsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;
  const state = await loadFindingList(projectId);
  const demoHref = `/app/w/${workspaceSlug}/projects/${projectId}/findings/${DEMO_FINDING_ID}`;

  if (state.status === "unauthorized") {
    return (
      <ErrorState title="Sign in required">
        Sign in with a workspace account to view findings. Your scans continue on the server.
      </ErrorState>
    );
  }
  if (state.status === "forbidden") {
    return (
      <BlockedState title="No access to this project">
        You don&apos;t have permission to access this project.
      </BlockedState>
    );
  }
  if (state.status === "not-found") notFound();
  if (state.status === "unavailable") {
    return (
      <EmptyState
        title="Findings API unavailable"
        actions={<Link href={demoHref}>View the synthetic demo finding</Link>}
      >
        The findings service did not answer ({state.detail}). Connect a safe test environment to run
        executable checks, or inspect the labeled demo finding instead — it is computed with the
        production oracle from recorded observations.
      </EmptyState>
    );
  }

  return (
    <div className={styles.page}>
      <h2>Findings</h2>
      {state.data.length === 0 ? (
        <EmptyState
          title="No findings recorded"
          actions={<Link href={demoHref}>View the synthetic demo finding</Link>}
        >
          No issues were reproduced in the checks run. That does not mean the entire application was
          security-tested.
        </EmptyState>
      ) : (
        <FindingList workspaceSlug={workspaceSlug} projectId={projectId} findings={state.data} />
      )}
    </div>
  );
}
