import { ScanWizard } from "../../../../features/scans/wizard";

export default function NewScanPage() {
  // TODO(L05/L18): projectId comes from workspace route params/session;
  // demo uses the seeded invoice-demo project slug for now.
  return <ScanWizard projectId="invoice-demo" />;
}
