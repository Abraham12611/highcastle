import { renderDetail } from "../detail-view";

export default async function FindingProofPage({
  params,
}: {
  params: Promise<{ findingId: string }>;
}) {
  const { findingId } = await params;
  return renderDetail(findingId, "proof");
}
