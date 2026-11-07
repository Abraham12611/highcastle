import type { Metadata } from "next";
import Link from "next/link";
import { Callout, FortressMark } from "@highcastle/ui";
import { SiteFooter } from "../../features/marketing/site-chrome";
import { DemoConsent } from "../../features/demo/demo-consent";
import { DemoPreview } from "../../features/demo/demo-preview";

export const metadata: Metadata = {
  title: "Live controlled demo",
  description:
    "Watch an authorized, bounded authorization check run on HighCastle's own synthetic invoice lab — disposable sandbox, independent verdict, replayable fix.",
};

export default function DemoPage() {
  return (
    <div className="min-h-screen">
      <header className="hc-topbar">
        <Link href="/" className="hc-topbar-brand">
          <FortressMark size={26} label={null} />
          <span className="hc-logo-word">HighCastle</span>
        </Link>
        <span className="hc-topbar-spacer" />
        <Link href="/" className="hc-btn hc-btn--ghost hc-btn--sm">
          ← Back to site
        </Link>
      </header>

      <div className="border-b border-hc-line bg-hc-primary-wash px-6 py-2.5 text-center font-mono text-xs text-hc-primary">
        Controlled test app — synthetic users and records only
      </div>

      <main className="mx-auto max-w-5xl px-6 py-12">
        <p className="hc-display text-xs text-hc-cyan">Live controlled demo</p>
        <h1 className="mt-3 text-3xl font-bold text-hc-text md:text-4xl">
          Watch an authorized test run — then prove the fix
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-hc-muted">
          This demo executes one bounded check on our own invoice lab: synthetic Alice must not read
          synthetic Bob&apos;s invoice. Same pipeline as the product — scope, model plan, sandbox
          execution, independent verdict — with every boundary enforced live.
        </p>

        <div className="mt-10 flex flex-col gap-10">
          <DemoConsent />
          <DemoPreview />
          <Callout tone="info" title="Ready for your own targets?">
            Verified-target onboarding and GitHub PR checks are the next milestones — the demo scope
            above shows exactly what authorization will look like when they land.
          </Callout>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
