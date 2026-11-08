import Link from "next/link";
import { FortressMark } from "@highcastle/ui";
import { SiteFooter, SiteHeader } from "../features/marketing/site-chrome";
import { Hero } from "../features/marketing/hero";
import { Workflow } from "../features/marketing/workflow";
import { Proof } from "../features/marketing/proof";
import { Audiences } from "../features/marketing/audiences";
import { Trust } from "../features/marketing/trust";
import { Faq } from "../features/marketing/faq";

/** Landing — "Your personal AI hacker." Public marketing surface. */
export default function Home() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <Hero />
        <Workflow />
        <Proof />
        <Audiences />
        <Trust />
        <Faq />
        <section className="border-t border-hc-line">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 py-20 text-center">
            <FortressMark size={44} label={null} />
            <h2 className="text-3xl text-hc-text" style={{ fontFamily: "var(--hc-font-display)" }}>
              Prove the risk. Prove the fix.
            </h2>
            <p className="max-w-lg text-sm text-hc-muted">
              Watch the controlled demo reproduce a real authorization failure on synthetic data —
              then verify the patch closes it.
            </p>
            <Link href="/demo" className="hc-btn hc-btn--primary hc-btn--lg">
              Try live controlled demo
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
