import { Panel, PanelBody } from "@highcastle/ui";

/** Short, honest FAQ — no marketing math, no overclaiming. */
const QA: Array<{ q: string; a: string }> = [
  {
    q: "Is this scanning the public internet?",
    a: "No. HighCastle only runs tests inside recorded authorization scope — currently our own synthetic invoice lab. There is no arbitrary-host input anywhere in the demo.",
  },
  {
    q: "Does the AI decide there's a vulnerability?",
    a: "No. The model proposes a hypothesis; a deterministic, independent oracle produces the verdict from observed behavior. Unreproducible results are marked inconclusive, never 'safe'.",
  },
  {
    q: "What does the demo actually do?",
    a: "It runs a bounded, read-only BOLA check (≤8 GETs, ≤30s) between two synthetic tenant accounts in a disposable sandbox, then lets you replay the patch.",
  },
  {
    q: "Is any of my data used?",
    a: "The demo uses only synthetic users (Alice, Bob) and synthetic invoices. No customer records, no production credentials, nothing leaves the lab boundary.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="border-t border-hc-line">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <p className="hc-display text-xs text-hc-muted">Straight answers</p>
        <h2 className="mt-3 text-2xl font-bold text-hc-text">Questions people actually ask</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {QA.map((item) => (
            <Panel key={item.q}>
              <PanelBody className="p-5">
                <h3 className="text-sm font-semibold text-hc-text">{item.q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-hc-muted">{item.a}</p>
              </PanelBody>
            </Panel>
          ))}
        </div>
      </div>
    </section>
  );
}
