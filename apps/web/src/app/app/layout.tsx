import type { ReactNode } from "react";

/**
 * Workspace routes render their own complete DashboardShell with a styled
 * top bar and navigation. Avoid wrapping it in a second, unstyled app-header.
 * The account profile action lives in DashboardShell's top bar.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
