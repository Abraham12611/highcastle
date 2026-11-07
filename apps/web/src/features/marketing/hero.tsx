import Link from "next/link";
import { PerimeterArt, StatusPill } from "@highcastle/ui";

/**
 * Hero — asymmetric layout: assertive left column (pixel display
 * headline, two CTAs, bounded copy) + original perimeter illustration
 * on the right with a slow scanline sweep.
 */
export function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl gap-10 px-6 pb-16 pt-14 md:grid-cols-[1.05fr_1fr] md:items-center md:pt-20">
      <div>
        <div className="mkt-reveal">
          <StatusPill
            tone="cyan"
            icon="beacon"
            notched
            label="Authorized AI red-team · owned synthetic lab"
          />
        </div>
        <h1
          className="mkt-reveal mkt-reveal-1 mt-6 text-4xl leading-[1.1] text-hc-text md:text-6xl"
          style={{ fontFamily: "var(--hc-font-display)" }}
        >
          Your personal
          <br />
          AI hacker<span className="text-hc-primary">.</span>
        </h1>
        <p className="mkt-reveal mkt-reveal-2 mt-5 max-w-xl text-lg text-hc-muted">
          Prove the risk. Prove the fix. HighCastle plans an authorized test with Vultr AI, runs it
          in a disposable sandbox, and shows you the evidence — then replays the patch.
        </p>
        <div className="mkt-reveal mkt-reveal-3 mt-8 flex flex-wrap gap-4">
          <Link href="/demo" className="hc-btn hc-btn--primary hc-btn--lg">
            Try live controlled demo
          </Link>
          <a href="#how-it-works" className="hc-btn hc-btn--secondary hc-btn--lg">
            How it works
          </a>
        </div>
        <p className="mkt-reveal mkt-reveal-4 mt-5 max-w-xl text-sm text-hc-subtle">
          Currently scoped to HighCastle&apos;s own invoice lab with synthetic users Alice and Bob —
          no customer systems, no arbitrary targets, read-only checks.
        </p>
      </div>

      <figure className="mkt-reveal mkt-reveal-2 hc-panel hc-scanline relative overflow-hidden p-2">
        <PerimeterArt width={560} className="w-full" />
        <figcaption className="absolute bottom-4 left-4 font-mono text-xs text-hc-subtle">
          perimeter under authorized test · synthetic lab
        </figcaption>
      </figure>
    </section>
  );
}
