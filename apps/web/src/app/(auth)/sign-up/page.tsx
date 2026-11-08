import { DemoEntryButton } from "../../../features/auth/demo-entry";

export const metadata = { title: "Sign up — HighCastle" };

/**
 * Sign-up — plain mirror of sign-in until the account lane (E5 Clerk v7,
 * PR #66) lands registration. No fake account creation: the only working
 * path is the limited server-issued guest session, stated plainly.
 */
export default function SignUpPage() {
  return (
    <section>
      <h2>Create your account</h2>
      <p>
        Full account registration is not part of the hackathon demo build
        yet — see the deferred-integration note in lib/auth/README.md. To
        explore HighCastle now, use the limited guest session:
      </p>
      <DemoEntryButton />
    </section>
  );
}
