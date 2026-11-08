import type { Metadata } from "next";
import { GithubIntegration } from "../../../../features/integrations/github-connect";

export const metadata: Metadata = {
  title: "GitHub integration",
  description:
    "Connect GitHub through the managed Composio OAuth link, select one repository, and run source-only reconnaissance.",
};

export default function GithubIntegrationPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <p className="hc-display text-xs text-hc-cyan">Integrations</p>
      <h1 className="mt-3 text-2xl font-bold text-hc-text">GitHub repository source</h1>
      <p className="mt-2 max-w-2xl text-sm text-hc-muted">
        Connect your GitHub account, pick exactly one repository, and HighCastle records its
        identity and immutable commit SHA for source-aware analysis.
      </p>
      <div className="mt-8">
        <GithubIntegration />
      </div>
    </main>
  );
}
