import { LiveScanView } from "../../../../features/scans/live-scan";

export default async function LiveScanPage({
  params,
}: {
  params: Promise<{ scanId: string }>;
}) {
  const { scanId } = await params;
  return <LiveScanView scanId={scanId} />;
}
