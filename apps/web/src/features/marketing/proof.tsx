import {
  EvidenceCard,
  Panel,
  PanelBody,
  PanelHeader,
  ReplayDiff,
  StatusPill,
} from "@highcastle/ui";

/**
 * Proof — the product's differentiator: an executed attempt with an
 * independent verdict, plus the before/after replay. Content is a
 * clearly labelled recorded fixture, not a live claim.
 */
export function Proof() {
  return (
    <section id="proof" className="border-t border-hc-line bg-hc-surface-1/40">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <p className="hc-display text-xs text-hc-violet">Proof, not promises</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <h2 className="max-w-xl text-2xl font-bold text-hc-text md:text-3xl">
            Beyond a security warning — an actual attempt and an actual verdict
          </h2>
          <StatusPill tone="slate" icon="file" label="Recorded sample run" />
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <Panel>
            <PanelHeader title="What the replay proved (sample fixture)" />
            <PanelBody>
              <ReplayDiff
                before={{
                  label: "Before · vulnerable",
                  environment: "lab-v1",
                  assertions: [
                    {
                      key: "1",
                      label: "Alice → Bob's private invoice",
                      result: "fail",
                      observed: "200 · invoice body",
                    },
                    { key: "2", label: "Alice → own invoice", result: "pass", observed: "200" },
                  ],
                  summary: "Cross-account read reproduced — 1 confirmed attack path.",
                }}
                after={{
                  label: "After · patched",
                  environment: "lab-v2",
                  assertions: [
                    {
                      key: "1",
                      label: "Alice → Bob's private invoice",
                      result: "denied",
                      observed: "403",
                    },
                    { key: "2", label: "Alice → own invoice", result: "pass", observed: "200" },
                  ],
                  summary: "0 reproduced · positive control passes.",
                }}
              />
            </PanelBody>
          </Panel>

          <div className="flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-hc-text">
              Evidence is a first-class artifact
            </h3>
            <EvidenceCard
              kind="redacted_response"
              title="GET /api/invoices/inv_B → 200"
              hash="sha256:9f2cd41b6a0f77e2c8a1b5d39e04c7a2f11e8d2c6b90a4f5e1c3d7b9a2e4f601"
              attemptRef="recorded sample run"
            />
            <EvidenceCard
              kind="oracle"
              title="bola-oracle-v1 verdict: reproduced"
              hash="sha256:77aa10fe2c4d8b01f6e3a9c5d7b2e4f6a8c0d2e4f6a8b0c2d4e6f8a0b2c4d6e8"
              attemptRef="independent verifier"
              redacted={false}
            />
            <p className="text-sm leading-relaxed text-hc-muted">
              Every check keeps the request, the observed response, the oracle assertion and the
              integrity digest — redacted before it ever reaches a page.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
