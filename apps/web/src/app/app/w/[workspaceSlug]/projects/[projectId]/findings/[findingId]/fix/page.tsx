import { renderDetail } from "../detail-view";

export default async function FindingFixPage({
  params,
}: {
  params: Promise<{ findingId: string }>;
}) {
  const { findingId } = await params;
  return renderDetail(findingId, "fix");
}
