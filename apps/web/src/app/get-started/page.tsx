import Link from "next/link";
import { Stepper } from "@highcastle/ui";
import { ModeChoice } from "../../features/auth/mode-choice";
import { DemoEntryButton } from "../../features/auth/demo-entry";

export const metadata = { title: "Get started — HighCastle" };

/**
 * Get started — the account entry path. Step 1 signs in (real Clerk
 * pages) or continues as guest; step 2 persists Builder/Developer to the
 * cookie today and to server preferences when E12's endpoint is live;
 * step 3 adds a source (E9/E10 lanes) or skips to a dashboard that E12's
 * lazy provisioning fills on first request.
 */
export default function GetStartedPage() {
  return (
    <main>
      <h1>Get started</h1>
      <p>Three short steps. You can skip ahead at any point.</p>
      <Stepper
        steps={[
          { key: "account", label: "Sign in" },
          { key: "mode", label: "Choose experience" },
          { key: "source", label: "Add source or open dashboard" },
        ]}
        current={0}
      />
      <section aria-labelledby="gs-account">
        <h2 id="gs-account">1. Sign in, or continue as guest</h2>
        <p>
          <Link href="/sign-in">Sign in</Link> · <Link href="/sign-up">Create an account</Link>
        </p>
        <p>Just looking around? No account needed:</p>
        <DemoEntryButton href="/demo" />
      </section>
      <section aria-labelledby="gs-mode">
        <h2 id="gs-mode">2. Choose how you want to see HighCastle</h2>
        <ModeChoice />
      </section>
      <section aria-labelledby="gs-source">
        <h2 id="gs-source">3. Add a source, or open your dashboard</h2>
        <ul>
          <li>
            Add a website (verified ownership) — <em>coming soon</em> (E10
            URL verification lane).
          </li>
          <li>
            Connect GitHub (read-only repo analysis) — <em>coming soon</em>.
            Server-side OAuth credentials are provisioned; the connect
            endpoint and repo picker land with the E9 lane.
          </li>
          <li>
            <Link href="/app">Skip to the dashboard</Link> — empty states
            guide you from there; first sign-in provisions a workspace via
            the account flow.
          </li>
        </ul>
      </section>
    </main>
  );
}
