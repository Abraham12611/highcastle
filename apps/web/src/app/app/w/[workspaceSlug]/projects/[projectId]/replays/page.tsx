import Link from "next/link";
import { EmptyState } from "@highcastle/ui";
import { loadReplayView } from "@/features/replays/loader";
import { ReplayComparison } from "@/features/replays/components/ReplayComparison";
import { DEMO_REPLAY_ID } from "@/features/findings/demo";
import styles from "@/features/findings/components/findings.module.css";

export default async function ReplaysPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;
  const state = await loadReplayView(DEMO_REPLAY_ID);
  const findingHref = `/app/w/${workspaceSlug}/projects/${projectId}/findings/${DEMO_REPLAY_ID}`;

  return (
    <div className={styles.page}>
      <h2>Replays</h2>
      {state.status === "ok" && state.data.comparison !== null ? (
        <>
          <p>
            Recorded demonstration replay. Live replays appear here after you run verification from
            a finding.
          </p>
          <ReplayComparison
            comparison={state.data.comparison}
            verdict={state.data.verdict}
            provenance={state.data.provenance}
          />
          <p>
            <Link href={findingHref}>Open the demo finding</Link>
          </p>
        </>
      ) : (
        <EmptyState title="No replays yet">
          Replays appear here after verification runs from a finding.
        </EmptyState>
      )}
    </div>
  );
}
