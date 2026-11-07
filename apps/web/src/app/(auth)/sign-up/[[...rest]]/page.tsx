import { SignUp } from "@clerk/nextjs";
import { DemoEntryButton } from "../../../../features/auth/demo-entry";
import { SessionPanel } from "../../../../features/auth/session-panel";

export const metadata = { title: "Sign up — HighCastle" };

const CLERK_KEY = process.env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"];

/**
 * Sign-up — Clerk account path (coordinator-selected provider) plus the
 * working demo session. No fake account creation: without a configured
 * key the only path is the server-issued guest session, stated plainly.
 */
export default function SignUpPage() {
  return (
    <section>
      <h2>Create your account</h2>
      {CLERK_KEY ? (
        <>
          <SignUp signInUrl="/sign-in" afterSignUpUrl="/app" />
          <h3>Just looking around?</h3>
        </>
      ) : (
        <p>
          Full account registration is not configured in this environment
          (no Clerk publishable key). To explore HighCastle now, use the
          limited guest session:
        </p>
      )}
      <SessionPanel
        signedOutSlot={
          CLERK_KEY ? (
            <DemoEntryButton />
          ) : (
            <>
              <p>
                Full account registration is not part of the hackathon demo
                build yet — see the deferred-integration note in
                lib/auth/README.md. To explore HighCastle now, use the
                limited guest session:
              </p>
              <DemoEntryButton />
            </>
          )
        }
      />
    </section>
  );
}
