import { SignIn } from "@clerk/nextjs";
import { clerkConfigured } from "../../../../server/auth/clerk";
import { DemoEntryButton } from "../../../../features/auth/demo-entry";

export const metadata = { title: "Sign in — HighCastle" };

export default function SignInPage() {
  return (
    <section className="auth-shell">
      <h2>Sign in</h2>
      {clerkConfigured() ? (
        <SignIn />
      ) : (
        <p>
          Account sign-in is not configured on this deployment. The limited guest demo is available
          below.
        </p>
      )}
      <hr />
      <p>
        Just want the live synthetic demo? Use the limited guest session — no account needed. Guests
        can never touch real targets or accounts.
      </p>
      <DemoEntryButton />
    </section>
  );
}
