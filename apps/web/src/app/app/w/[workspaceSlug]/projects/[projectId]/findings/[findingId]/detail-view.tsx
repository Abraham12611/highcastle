import { notFound } from "next/navigation";
import { BlockedState, ErrorState } from "@highcastle/ui";
import { FindingDetail, type FindingTabKey } from "@/features/findings/components/FindingDetail";
import { loadFindingDetail } from "@/features/findings/loader";

/** Shared detail renderer for the finding page and its tab sub-routes. */
export async function renderDetail(findingId: string, tab: FindingTabKey) {
  const state = await loadFindingDetail(findingId);
  if (state.status === "not-found") notFound();
  if (state.status === "unauthorized") {
    return (
      <ErrorState title="Sign in required">
        Sign in with a workspace account to view this finding.
      </ErrorState>
    );
  }
  if (state.status === "forbidden") {
    return (
      <BlockedState title="No access to this finding">
        You don&apos;t have permission to access this finding.
      </BlockedState>
    );
  }
  if (state.status === "unavailable") {
    return (
      <ErrorState title="Finding unavailable" diagnostic={state.detail}>
        The findings service did not answer. Evidence is preserved; try again shortly.
      </ErrorState>
    );
  }
  return <FindingDetail detail={state.data} initialTab={tab} />;
}
