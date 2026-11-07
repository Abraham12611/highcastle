import { DemoEntryButton } from "../../../features/auth/demo-entry";

export const metadata = { title: "Sign in — HighCastle" };

export default function SignInPage() {
  return (
    <section>
      <h2>Sign in</h2>
      <p>
        Full account sign-in (Better Auth + GitHub) is not part of the
        hackathon demo build — see the deferred-integration note in
        lib/auth/README.md. For the live demo, use the limited guest session:
      </p>
      <DemoEntryButton />
    </section>
  );
}
