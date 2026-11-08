import Link from "next/link";
import { FortressMark } from "@highcastle/ui";
import { ModeChoice } from "../../features/auth/mode-choice";
import styles from "../get-started/get-started.module.css";

export const metadata = { title: "Welcome — HighCastle" };

/**
 * Legacy /onboarding route uses the same scoped, responsive styling as
 * /get-started. Keep the old heading for existing deep links and tests;
 * the canonical account-first flow lives at /get-started.
 */
export default function OnboardingPage() {
  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <Link href="/" className={styles.brand}>
            <FortressMark size={28} label={null} />
            <span>HighCastle</span>
          </Link>
          <nav className={styles.nav} aria-label="Onboarding navigation">
            <Link href="/get-started" className={styles.navCta}>Full setup</Link>
          </nav>
        </header>
        <section className={styles.hero}>
          <p className={styles.kicker}>CHOOSE YOUR EXPERIENCE</p>
          <h1 className={styles.heading}>Welcome to <span className={styles.headingAccent}>HighCastle.</span></h1>
          <p className={styles.subheading}>
            HighCastle proves a real authorization defect on our owned synthetic target
            and then proves the fix. Choose how you want to see the evidence.
          </p>
        </section>
        <div className={styles.layout}>
          <section className={styles.card} aria-label="Display preference">
            <div className={styles.cardTitle}>
              <span className={styles.cardNumber}>01</span>
              <h2>Choose your display mode</h2>
            </div>
            <div className={styles.choice}><ModeChoice /></div>
            <div className={styles.dashboardRow}>
              <Link href="/get-started" className={styles.dashboardButton}>Continue setup →</Link>
              <Link href="/demo" className={styles.secondaryButton}>Controlled demo</Link>
            </div>
          </section>
          <aside className={styles.sidebar}>
            <div className={styles.scopePanel}>
              <strong>Owned synthetic test environment only</strong>
              <p>The guest demo cannot be pointed at other systems. Real projects
                require separately verified ownership and approved scope.</p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
