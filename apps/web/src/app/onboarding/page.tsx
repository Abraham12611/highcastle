import { ModeChoice } from "../../features/auth/mode-choice";

export const metadata = { title: "Welcome — HighCastle" };

export default function OnboardingPage() {
  return (
    <main>
      <h1>Welcome to HighCastle</h1>
      <p>
        HighCastle proves a real authorization defect in a synthetic invoice
        app — and then proves the fix. Choose how you want to see the evidence.
      </p>
      <ModeChoice />
      <p>
        <small>
          Demo runs only against our owned synthetic target. You cannot point it
          at other systems.
        </small>
      </p>
    </main>
  );
}
