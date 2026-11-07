import type { ReactNode } from "react";
import { ProfileMenu } from "../../features/auth/profile-menu";

/**
 * Minimal authenticated-app layout. `proxy.ts` enforces the Clerk session
 * upstream; this adds the profile menu chrome. L08 owns the dashboard shell
 * styling — keep this thin so their nav can replace it.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <header className="app-header">
        <span>HighCastle</span>
        <ProfileMenu />
      </header>
      {children}
    </div>
  );
}
