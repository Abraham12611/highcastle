import Link from "next/link";
import { FortressMark } from "@highcastle/ui";

/**
 * Marketing site chrome — compact utility nav and footer.
 * Auth/onboarding routes are L05's; CTAs here only point at /demo,
 * anchors and the repo docs.
 */

export function SiteHeader() {
  return (
    <header className="hc-topbar" style={{ position: "sticky", top: 0, zIndex: 40 }}>
      <Link href="/" className="hc-topbar-brand">
        <FortressMark size={26} label={null} />
        <span className="hc-logo-word">HighCastle</span>
      </Link>
      <nav aria-label="Site" className="hidden items-center gap-6 text-sm text-hc-muted md:flex">
        <a href="#how-it-works" className="hover:text-hc-text">
          How it works
        </a>
        <a href="#proof" className="hover:text-hc-text">
          Proof
        </a>
        <a href="#trust" className="hover:text-hc-text">
          Trust &amp; scope
        </a>
        <a href="#faq" className="hover:text-hc-text">
          FAQ
        </a>
      </nav>
      <span className="hc-topbar-spacer" />
      <Link href="/demo" className="hc-btn hc-btn--primary hc-btn--sm">
        Try live demo
      </Link>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-hc-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 md:flex-row md:items-start md:justify-between">
        <div className="flex items-center gap-3">
          <FortressMark size={22} label={null} />
          <div>
            <p className="hc-logo-word text-sm">HighCastle</p>
            <p className="text-xs text-hc-subtle">
              Authorized testing on owned, synthetic targets only.
            </p>
          </div>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-8 gap-y-3 text-sm text-hc-muted">
          <Link href="/demo" className="hover:text-hc-text">
            Live demo
          </Link>
          <a href="#how-it-works" className="hover:text-hc-text">
            How it works
          </a>
          <a href="#trust" className="hover:text-hc-text">
            Acceptable use
          </a>
          <a
            href="https://github.com/Abraham12611/highcastle"
            className="hover:text-hc-text"
            target="_blank"
            rel="noreferrer"
          >
            Source
          </a>
        </nav>
      </div>
      <p className="border-t border-hc-line px-6 py-4 text-center font-mono text-xs text-hc-subtle">
        Built for the Vultr Agent Rush hackathon · original Nocturne Signal design · never test
        systems you do not own
      </p>
    </footer>
  );
}
