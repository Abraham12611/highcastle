import Link from "next/link";
import { FortressMark, Stepper } from "@highcastle/ui";
import { ModeChoice } from "../../features/auth/mode-choice";
import { DemoEntryButton } from "../../features/auth/demo-entry";
import styles from "./get-started.module.css";

export const metadata = { title: "Get started — HighCastle" };

/**
 * Public account-first entry. Ownership-restricted source integrations are
 * displayed honestly while their backends are still under integration.
 * The synthetic demo is an independent guest flow, never account authority.
 */
export default function GetStartedPage() {
  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <Link href="/" className={styles.brand} aria-label="HighCastle homepage">
            <FortressMark size={28} label={null} />
            <span>HighCastle</span>
          </Link>
          <nav className={styles.nav} aria-label="Onboarding navigation">
            <Link href="/">Home</Link>
            <Link className={styles.navCta} href="/demo">Try controlled demo</Link>
          </nav>
        </header>

        <section className={styles.hero} aria-labelledby="get-started-heading">
          <div className={styles.kicker}>
            <span className={styles.kickerDot} aria-hidden="true" />
            YOUR SECURITY WORKSPACE · SETUP / 01
          </div>
          <h1 className={styles.heading} id="get-started-heading">
            Security testing starts <span className={styles.headingAccent}>here.</span>
          </h1>
          <p className={styles.subheading}>
            Create your workspace, choose how you like to work, and connect an
            approved target when you&apos;re ready. A contained live demo is available without an account.
          </p>
        </section>

        <div className={styles.progress} aria-label="Onboarding progress">
          <Stepper
            steps={[
              { key: "account", label: "Create account" },
              { key: "mode", label: "Choose experience" },
              { key: "source", label: "Add a source" },
            ]}
            current={0}
          />
        </div>

        <div className={styles.layout}>
          <div className={styles.primary}>
            <section className={styles.card} aria-labelledby="gs-account">
              <div className={styles.cardTitle}>
                <span className={styles.cardNumber}>01</span>
                <h2 id="gs-account">Start with your account</h2>
              </div>
              <p className={styles.description}>
                Sign in securely with GitHub or Google using the HighCastle account flow.
                You can also explore our isolated demo before creating an account.
              </p>
              <div className={styles.actions}>
                <Link href="/sign-up" className={styles.primaryButton}>Create an account <span aria-hidden="true">↗</span></Link>
                <Link href="/sign-in" className={styles.secondaryButton}>Sign in</Link>
              </div>
              <div className={styles.demoBlock}>
                <DemoEntryButton href="/demo" />
              </div>
            </section>

            <section className={styles.card} aria-labelledby="gs-mode">
              <div className={styles.cardTitle}>
                <span className={styles.cardNumber}>02</span>
                <h2 id="gs-mode">Personalize your view</h2>
              </div>
              <p className={styles.description}>
                Both experiences use the same secure backend. This preference only changes
                how technical details appear in your dashboard.
              </p>
              <div className={styles.choice}>
                <ModeChoice />
              </div>
            </section>

            <section className={styles.card} aria-labelledby="gs-source">
              <div className={styles.cardTitle}>
                <span className={styles.cardNumber}>03</span>
                <h2 id="gs-source">Choose what to assess</h2>
              </div>
              <p className={styles.description}>
                Once connected, sources will appear in your Projects dashboard. Both
                integrations require permission and are being finalized.
              </p>
              <div className={styles.sourceList}>
                <div className={styles.sourceItem}>
                  <span className={styles.sourceIcon} aria-hidden="true">◎</span>
                  <div className={styles.sourceText}>
                    <strong>Website URL</strong>
                    <p>Verify that you control the site, then run bounded passive checks.</p>
                  </div>
                  <span className={styles.pending}>COMING SOON</span>
                </div>
                <div className={styles.sourceItem}>
                  <span className={styles.sourceIcon} aria-hidden="true">⌘</span>
                  <div className={styles.sourceText}>
                    <strong>GitHub repository</strong>
                    <p>Connect with read-only OAuth and explicitly select a repository.</p>
                  </div>
                  <span className={styles.pending}>COMING SOON</span>
                </div>
              </div>
              <div className={styles.dashboardRow}>
                <Link className={styles.dashboardButton} href="/app">Open dashboard <span aria-hidden="true">→</span></Link>
                <span>Skip source setup for now</span>
              </div>
            </section>
          </div>

          <aside className={styles.sidebar} aria-label="How HighCastle works">
            <div className={styles.sidePanel}>
              <p className={styles.sideEyebrow}>HOW IT WORKS</p>
              <h2 className={styles.sideHeading}>Security, with proof at every step.</h2>
              <div className={styles.sideItem}>
                <span className={styles.sideItemNumber}>01</span>
                <div><h3>Authorize</h3><p>Choose a target and define the scope before anything runs.</p></div>
              </div>
              <div className={styles.sideItem}>
                <span className={styles.sideItemNumber}>02</span>
                <div><h3>Isolate</h3><p>Real work executes in a bounded, disposable sandbox on Vultr.</p></div>
              </div>
              <div className={styles.sideItem}>
                <span className={styles.sideItemNumber}>03</span>
                <div><h3>Verify</h3><p>Independent evidence determines findings and patch results.</p></div>
              </div>
            </div>
            <div className={styles.scopePanel}>
              <strong>Containment-first by design</strong>
              <p>The public demo runs only against HighCastle&apos;s synthetic lab.
              Real websites and repositories require their own authorization before use.</p>
            </div>
          </aside>
        </div>

        <footer className={styles.footer}>
          <span>HIGHCASTLE / AUTHORIZED SECURITY TESTING</span>
          <Link href="/">Back to home</Link>
        </footer>
      </div>
    </main>
  );
}
