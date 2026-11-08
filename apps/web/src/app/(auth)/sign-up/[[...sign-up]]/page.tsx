import { SignUp } from "@clerk/nextjs";
import { clerkConfigured } from "../../../../server/auth/clerk";
import { DemoEntryButton } from "../../../../features/auth/demo-entry";

export const metadata = { title: "Sign up — HighCastle" };

export default function SignUpPage() {
  return (
    <section className="auth-shell">
      <h2>Create account</h2>
      {clerkConfigured() ? (
        <SignUp />
      ) : (
        <p>
          Account registration is not configured on this deployment. The limited guest demo is
          available below.
        </p>
      )}
      <hr />
      <p>Just want the live synthetic demo? Use the limited guest session — no account needed.</p>
      <DemoEntryButton />
    </section>
  );
}
