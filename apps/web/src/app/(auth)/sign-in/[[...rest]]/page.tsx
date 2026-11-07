import { SignIn } from "@clerk/nextjs";
import { DemoEntryButton } from "../../../../features/auth/demo-entry";
import { SessionPanel } from "../../../../features/auth/session-panel";

export const metadata = { title: "Sign in — HighCastle" };

const CLERK_KEY = process.env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"];

/**
 * Sign-in — Clerk account path (coordinator-selected provider) plus the
 * working demo session. Clerk handles its own sub-routes via the
 * catch-all segment. Full account loop (Clerk session → app workspace
 * access) lands with E5's server mapping; until then an account sign-in
 * reaches the dashboard shell, which renders honest empty/unauthorized
 * states rather than fabricated access.
 */
export default function SignInPage() {
  return (
    <section>
      <h2>Sign in</h2>
      {CLERK_KEY ? (
        <>
          <SignIn signUpUrl="/sign-up" afterSignInUrl="/app" />
          <h3>Just looking around?</h3>
        </>
      ) : (
        <p>
          Account sign-in is not configured in this environment (no Clerk
          publishable key). For the live demo, use the limited guest
          session:
        </p>
      )}
      <SessionPanel
        signedOutSlot={
          CLERK_KEY ? (
            <DemoEntryButton />
          ) : (
            <>
              <p>
                Full account sign-in is not part of the hackathon demo build
                — see the deferred-integration note in lib/auth/README.md. For
                the live demo, use the limited guest session:
              </p>
              <DemoEntryButton />
            </>
          )
        }
      />
    </section>
  );
}
