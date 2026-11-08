import Link from "next/link";
import { EmptyState, LoadingState, VerdictBadge } from "@highcastle/ui";
import { loadReplayView } from "@/features/replays/loader";
import { ReplayComparison } from "@/features/replays/components/ReplayComparison";
import { verdictExplainer } from "@/features/findings/view-model";
import { DEMO_REPLAY_ID } from "@/features/findings/demo";
import styles from "@/features/findings/components/findings.module.css";

export default async function ReplayDetailPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string; replayId: string }>;
}) {
  const { workspaceSlug, projectId, replayId } = await params;
  const state = await loadReplayView(replayId);
  const findingHref = `/app/w/${workspaceSlug}/projects/${projectId}/findings/${DEMO_REPLAY_ID}`;

  if (state.status !== "ok") {
    return (
      <EmptyState
        title="Replay not available"
        actions={<Link href={findingHref}>View the synthetic demo replay</Link>}
      >
        This replay is not served by the API yet. Replays appear here after verification runs from a
        finding.
      </EmptyState>
    );
  }

  return (
    <div className={styles.page}>
      <h2>Patch replay</h2>
      {state.data.pending ? (
        <>
          <LoadingState label="Replay running" />
          <ul>
            {state.data.provenance.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p>
            The server has not persisted a verdict yet — no badge is shown
            until it does.
          </p>
        </>
      ) : state.data.comparison !== null ? (
        <ReplayComparison
          comparison={state.data.comparison}
          verdict={state.data.verdict}
          provenance={state.data.provenance}
        />
      ) : (
        <>
          <p>
            <VerdictBadge verdict={state.data.verdict} /> {verdictExplainer(state.data.verdict)}
          </p>
          <ul>
            {state.data.provenance.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p>
            Full before/after evidence is unavailable for this replay — only the server verdict and
            assertion outcomes are shown.
          </p>
        </>
      )}
    </div>
  );
}
