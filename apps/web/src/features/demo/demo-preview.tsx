import {
  ContainmentLedger,
  EvidenceCard,
  Panel,
  PanelBody,
  PanelHeader,
  StatusPill,
  Timeline,
} from "@highcastle/ui";

/**
 * Recorded preview — a static fixture showing what a live run emits.
 * Labelled explicitly so it can never be mistaken for live progress.
 */
export function DemoPreview() {
  return (
    <section aria-labelledby="demo-preview-title">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 id="demo-preview-title" className="text-lg font-bold text-hc-text">
          What a run looks like
        </h2>
        <StatusPill tone="slate" icon="file" label="Recorded preview — sample fixture" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Panel>
          <PanelHeader title="Event timeline (recorded)" />
          <PanelBody>
            <Timeline
              events={[
                {
                  id: "1",
                  title: "Vultr model proposed BOLA hypothesis",
                  actor: "model",
                  phase: "planning",
                  status: "done",
                  timestamp: "14:02:11Z",
                },
                {
                  id: "2",
                  title: "Policy validated bola-invoice-v1",
                  actor: "policy",
                  phase: "planning",
                  status: "done",
                  timestamp: "14:02:12Z",
                },
                {
                  id: "3",
                  title: "Disposable runner allocated, caps enforced",
                  actor: "runner",
                  phase: "preparing",
                  status: "done",
                  timestamp: "14:02:14Z",
                },
                {
                  id: "4",
                  title: "Alice → own invoice baseline",
                  actor: "runner",
                  phase: "executing",
                  status: "done",
                  timestamp: "14:02:16Z",
                  detail: "HTTP 200 · own synthetic record",
                },
                {
                  id: "5",
                  title: "Alice → Bob boundary check",
                  actor: "runner",
                  phase: "executing",
                  status: "done",
                  timestamp: "14:02:18Z",
                  detail: "HTTP 200 · Bob's protected invoice returned",
                },
                {
                  id: "6",
                  title: "Oracle verdict: reproduced",
                  actor: "oracle",
                  phase: "verifying",
                  status: "done",
                  timestamp: "14:02:19Z",
                },
              ]}
            />
          </PanelBody>
        </Panel>
        <div className="flex flex-col gap-4">
          <EvidenceCard
            kind="redacted_response"
            title="GET /api/invoices/inv_B → 200"
            hash="sha256:9f2cd41b6a0f77e2c8a1b5d39e04c7a2f11e8d2c6b90a4f5e1c3d7b9a2e4f601"
            attemptRef="recorded sample run"
          />
          <ContainmentLedger
            entries={[
              { key: "net", label: "Network egress", status: "enforced", value: "restricted" },
              { key: "mount", label: "Host mounts", status: "enforced", value: "none" },
              { key: "secret", label: "Secret access", status: "enforced", value: "none mounted" },
              { key: "cap", label: "Request cap", status: "enforced", value: "4 / 8 used" },
              { key: "blk", label: "Policy blocks", status: "clear", value: "none this run" },
            ]}
          />
        </div>
      </div>
    </section>
  );
}
