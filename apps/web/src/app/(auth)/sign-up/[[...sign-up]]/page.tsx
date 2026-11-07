import { SignUp } from "@clerk/nextjs";

export const metadata = { title: "Sign up — HighCastle" };

export default function SignUpPage() {
  return (
    <section className="auth-shell">
      <h2>Create account</h2>
      <SignUp />
    </section>
  );
}
