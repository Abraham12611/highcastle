import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

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
  return (
    <html lang="en">
      <body className="hc-root">{children}</body>
    </html>
  );
}
