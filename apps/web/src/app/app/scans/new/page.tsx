import { DEMO_IDS } from "@highcastle/db";
import { ScanWizard } from "../../../../features/scans/wizard";

export default function NewScanPage() {
  // The demo assessment-context endpoint accepts a project UUID, not a slug.
  // Use the deterministic, server-owned ID of the authorized synthetic seed.
  return <ScanWizard projectId={DEMO_IDS.projectId} />;
}
