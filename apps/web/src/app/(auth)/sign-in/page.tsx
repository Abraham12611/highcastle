import { DemoEntryButton } from "../../../features/auth/demo-entry";
import { SessionPanel } from "../../../features/auth/session-panel";

export const metadata = { title: "Sign in — HighCastle" };

/**
 * Sign-in — session-aware. A live demo session lands on the dashboard;
 * otherwise the server-issued guest entry is offered. Full account
 * sign-in (Better Auth per E5's README, or Clerk per coordinator order)
 * is not part of the hackathon demo build.
 */
export default function SignInPage() {
  return (
    <section>
      <h2>Sign in</h2>
      <SessionPanel
        signedOutSlot={
          <>
            <p>
              Full account sign-in is not part of the hackathon demo build —
              see the deferred-integration note in lib/auth/README.md. For
              the live demo, use the limited guest session:
            </p>
            <DemoEntryButton />
          </>
        }
      />
    </section>
  );
}
