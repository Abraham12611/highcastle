import Link from "next/link";
import { Stepper } from "@highcastle/ui";
import { ModeChoice } from "../../features/auth/mode-choice";
import { DemoEntryButton } from "../../features/auth/demo-entry";

export const metadata = { title: "Get started — HighCastle" };

/**
 * Get started — step 1 of the ≤3-step onboarding (mode → source/target →
 * dashboard). Steps 2's GitHub/URL paths belong to the E9/E10 lanes and
 * render as honest Coming Soon until they land; the controlled demo and
 * skip-to-dashboard paths work today. No Clerk imports, no shared auth
 * provider changes — account registration arrives with E5 (PR #66).
 */
export default function GetStartedPage() {
  return (
    <main>
      <h1>Get started</h1>
      <p>Three short steps. You can skip ahead at any point.</p>
      <Stepper
        steps={[
          { key: "mode", label: "Choose experience" },
          { key: "source", label: "Add source or target" },
          { key: "dashboard", label: "Open dashboard" },
        ]}
        current={0}
      />
      <section aria-labelledby="gs-mode">
        <h2 id="gs-mode">1. Choose how you want to see HighCastle</h2>
        <ModeChoice />
      </section>
      <section aria-labelledby="gs-source">
        <h2 id="gs-source">2. Add a website or connect GitHub</h2>
        <ul>
          <li>
            <DemoEntryButton href="/demo" /> — runs now against the owned
            synthetic invoice lab.
          </li>
          <li>
            Add a website (verified ownership) — <em>coming soon</em> (E10
            URL verification lane).
          </li>
          <li>
            Connect GitHub (read-only repo analysis) — <em>coming soon</em>.
            Server-side OAuth credentials are provisioned; the connect
            endpoint and repo picker land with the E9 lane.
          </li>
        </ul>
      </section>
      <section aria-labelledby="gs-go">
        <h2 id="gs-go">3. Open your dashboard</h2>
        <p>
          <Link href="/app">Skip to the dashboard</Link> — empty states
          guide you from there.
        </p>
      </section>
    </main>
  );
}
