import { Callout, ContainmentDiagram, Icon } from "@highcastle/ui";

/**
 * Trust & scope — the containment story plus honest limitations.
 * Claims stay bounded: synthetic lab today, PR automation marked as
 * coming soon, never "scan any website".
 */
export function Trust() {
  return (
    <section id="trust" className="border-t border-hc-line bg-hc-surface-1/40">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-[1fr_1.15fr] lg:items-center">
        <div>
          <p className="hc-display text-xs text-hc-cyan">Trust &amp; scope</p>
          <h2 className="mt-3 text-2xl font-bold text-hc-text md:text-3xl">
            The boundary is the feature
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-hc-muted">
            Every active test runs inside nested, recorded boundaries. The sandbox gets no provider
            credentials, no host mounts and no network egress beyond the approved lab — and a denial
            is itself recorded as evidence.
          </p>
          <ul className="mt-6 flex flex-col gap-3 text-sm text-hc-muted">
            <li className="flex gap-3">
              <Icon name="shield-check" size={16} className="mt-0.5 flex-none text-hc-primary" />{" "}
              Immutable, hashed authorization scope per run
            </li>
            <li className="flex gap-3">
              <Icon name="box" size={16} className="mt-0.5 flex-none text-hc-cyan" /> Disposable,
              unprivileged runner — destroyed and verified clean
            </li>
            <li className="flex gap-3">
              <Icon name="shield-off" size={16} className="mt-0.5 flex-none text-hc-orange" />{" "}
              Egress, filesystem and secret access denied by policy
            </li>
            <li className="flex gap-3">
              <Icon name="eye" size={16} className="mt-0.5 flex-none text-hc-success" /> The model
              never sets a verdict — an independent oracle does
            </li>
          </ul>
          <div className="mt-8">
            <Callout tone="policy" title="Honest current limits">
              Today HighCastle demonstrates one authorized pack on our own invoice lab. Testing of
              your own verified targets and GitHub PR checks are coming soon — not shipping claims
              we haven&apos;t built.
            </Callout>
          </div>
        </div>
        <figure className="hc-panel p-4">
          <ContainmentDiagram width={620} className="w-full" />
          <figcaption className="mt-2 text-center font-mono text-xs text-hc-subtle">
            nested boundaries: host → control plane → ephemeral runner → owned test app
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
