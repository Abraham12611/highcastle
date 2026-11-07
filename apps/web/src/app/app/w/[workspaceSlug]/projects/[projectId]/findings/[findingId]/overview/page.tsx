import { renderDetail } from "../detail-view";

export default async function FindingOverviewPage({
  params,
}: {
  params: Promise<{ findingId: string }>;
}) {
  const { findingId } = await params;
  return renderDetail(findingId, "overview");
}
