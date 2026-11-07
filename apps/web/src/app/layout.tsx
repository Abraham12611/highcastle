import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

/**
 * Clerk is the selected account provider (coordinator direction). The
 * provider mounts ONLY when the publishable key is configured, so local
 * builds, CI, and the keyless demo path keep working exactly as before.
 * Route protection unification stays with E5 (auth lane).
 */
const CLERK_KEY = process.env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"];

export const metadata: Metadata = {
  metadataBase: new URL(process.env.HIGHCASTLE_APP_URL ?? "http://localhost:3000"),
  title: {
    default: "HighCastle — Your personal AI hacker",
    template: "%s · HighCastle",
  },
  description:
    "Authorized AI red-team testing on your own systems. HighCastle plans with Vultr AI, executes in disposable sandboxes, verifies with an independent oracle, and replays the fix. Prove the risk. Prove the fix.",
  icons: {
    icon: [
      { url: "/brand/favicon.svg", type: "image/svg+xml" },
      { url: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/brand/icon-180.png",
  },
  openGraph: {
    title: "HighCastle — Your personal AI hacker",
    description: "Prove the risk. Prove the fix. Authorized testing on owned, synthetic targets.",
    images: ["/brand/cover.svg"],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const body = <body className="hc-root">{children}</body>;
  if (!CLERK_KEY) return <html lang="en">{body}</html>;
  return (
    <html lang="en">
      <ClerkProvider>{body}</ClerkProvider>
    </html>
  );
}
