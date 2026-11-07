import Link from "next/link";
import { Icon, Panel, PanelBody } from "@highcastle/ui";

/**
 * Builder / Developer positioning — two paths, same honest evidence.
 */
export function Audiences() {
  return (
    <section className="border-t border-hc-line">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-6 md:grid-cols-2">
          <Panel>
            <PanelBody className="flex h-full flex-col gap-4 p-6">
              <span className="hc-display text-xs text-hc-primary">Builder mode</span>
              <h3 className="text-xl font-bold text-hc-text">Shipping at AI speed?</h3>
              <p className="text-sm leading-relaxed text-hc-muted">
                Your generator wrote the authorization logic. HighCastle checks whether it actually
                holds — in plain language, with a consequence you can read to your team: “Alice
                could retrieve Bob&apos;s private invoice.”
              </p>
              <ul className="flex flex-col gap-2 text-sm text-hc-muted">
                <li className="flex gap-2">
                  <Icon name="check" size={14} className="mt-0.5 text-hc-primary" /> Plain-language
                  business impact
                </li>
                <li className="flex gap-2">
                  <Icon name="check" size={14} className="mt-0.5 text-hc-primary" /> Copyable fix
                  prompt for your coding agent
                </li>
                <li className="flex gap-2">
                  <Icon name="check" size={14} className="mt-0.5 text-hc-primary" /> One-click
                  replay after the patch
                </li>
              </ul>
              <div className="mt-auto pt-2">
                <Link href="/demo" className="hc-btn hc-btn--secondary">
                  See it on the demo lab
                </Link>
              </div>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelBody className="flex h-full flex-col gap-4 p-6">
              <span className="hc-display text-xs text-hc-cyan">Developer mode</span>
              <h3 className="text-xl font-bold text-hc-text">Evidence-grade testing</h3>
              <p className="text-sm leading-relaxed text-hc-muted">
                Structured plans, immutable scope hashes, persisted event streams and per-attempt
                artifacts with SHA-256 digests. The oracle is deterministic and independent — HTTP
                200 alone never classifies a finding.
              </p>
              <ul className="flex flex-col gap-2 text-sm text-hc-muted">
                <li className="flex gap-2">
                  <Icon name="check" size={14} className="mt-0.5 text-hc-cyan" /> CWE-mapped
                  findings with provenance
                </li>
                <li className="flex gap-2">
                  <Icon name="check" size={14} className="mt-0.5 text-hc-cyan" /> Durable SSE event
                  log with resume
                </li>
                <li className="flex gap-2">
                  <Icon name="check" size={14} className="mt-0.5 text-hc-cyan" /> Replay verdicts
                  recorded per revision
                </li>
              </ul>
              <div className="mt-auto pt-2">
                <a href="#trust" className="hc-btn hc-btn--ghost">
                  Read the containment model
                </a>
              </div>
            </PanelBody>
          </Panel>
        </div>
      </div>
    </section>
  );
}
