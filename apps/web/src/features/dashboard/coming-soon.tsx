import { EmptyState } from "@highcastle/ui";

/**
 * Placeholder for routes whose lane has not delivered yet. States the
 * owning lane and what exists today — never a fake control or metric.
 */
export function ComingSoon({
  title,
  owner,
  children,
}: {
  title: string;
  owner: string;
  children?: React.ReactNode;
}) {
  return (
    <EmptyState title={`${title} — coming soon`}>
      {children} Owned by {owner}; this surface ships when that lane&apos;s
      API and tests land. Nothing here is live yet.
    </EmptyState>
  );
}
