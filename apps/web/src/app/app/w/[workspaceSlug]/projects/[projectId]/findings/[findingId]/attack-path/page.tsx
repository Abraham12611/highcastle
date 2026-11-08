import { renderDetail } from "../detail-view";

export default async function FindingAttackPathPage({
  params,
}: {
  params: Promise<{ findingId: string }>;
}) {
  const { findingId } = await params;
  return renderDetail(findingId, "attack-path");
}
