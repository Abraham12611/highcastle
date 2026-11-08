import { renderDetail } from "../detail-view";

export default async function FindingReplayPage({
  params,
}: {
  params: Promise<{ findingId: string }>;
}) {
  const { findingId } = await params;
  return renderDetail(findingId, "replay");
}
