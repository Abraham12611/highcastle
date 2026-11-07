import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main>
      <h1>HighCastle</h1>
      {children}
    </main>
  );
}
