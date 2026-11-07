import { renderDetail } from "./detail-view";

export default async function FindingDetailPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string; findingId: string }>;
}) {
  const { findingId } = await params;
  return renderDetail(findingId, "overview");
}
