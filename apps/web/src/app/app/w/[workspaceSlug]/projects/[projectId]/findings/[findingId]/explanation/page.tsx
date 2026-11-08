import { renderDetail } from "../detail-view";

export default async function FindingExplanationPage({
  params,
}: {
  params: Promise<{ findingId: string }>;
}) {
  const { findingId } = await params;
  return renderDetail(findingId, "explanation");
}
