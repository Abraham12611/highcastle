import type { ReactNode } from "react";
import Link from "next/link";
import { FortressMark, TopBar, type NavSectionData } from "@highcastle/ui";
import { MobileNav, ModeSwitch, WorkspaceRail, WorkspaceSwitcher } from "./shell-client";
import type { ExperienceMode } from "./mode";
import { MODE_DESCRIPTION } from "./mode";
import styles from "./shell.module.css";
import { clerkConfigured } from "../../server/auth/clerk";
import { ProfileMenu } from "../auth/profile-menu";

/**
 * Protected `/app` shell (L08 owns this frame; L09/L10 pages nest inside).
 *
 * - Skip link + landmarks + polite live region for async updates.
 * - Desktop left rail; icon-only rail under 1280px; drawer under 1024px.
 * - Top bar: fortress mark, workspace switcher, mode switch. No fabricated
 *   notifications, search or profile surfaces (those lanes own them).
 */

export interface ShellCrumb {
  label: string;
  href?: string;
}

/** Page-level breadcrumb (each /app page renders its own trail). */
export function PageCrumbs({ items }: { items: ShellCrumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className={styles.crumbs}>
      <ol>
        {items.map((crumb, index) => (
          <li key={index}>
            {crumb.href && index < items.length - 1 ? (
              <Link href={crumb.href}>{crumb.label}</Link>
            ) : (
              <span aria-current="page">{crumb.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function DashboardShell({
  workspaceName,
  workspaceSlug,
  workspaces,
  mode,
  sections,
  activeKey,
  navLabel,
  children,
}: {
  workspaceName: string;
  workspaceSlug: string;
  workspaces: { slug: string; name: string }[];
  mode: ExperienceMode;
  sections: NavSectionData[];
  activeKey?: string | undefined;
  navLabel?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className={styles.shell}>
      <a href="#hc-content" className={styles.skip}>
        Skip to content
      </a>
      <TopBar
        brand={
          <Link
            href={`/app/w/${workspaceSlug}/overview`}
            className={styles.brand}
            aria-label="HighCastle workspace overview"
          >
            <FortressMark size={26} label={null} />
            <span className={styles.wordmark}>HighCastle</span>
          </Link>
        }
        actions={
          <span className={styles.actions}>
            <WorkspaceSwitcher workspaces={workspaces} currentSlug={workspaceSlug} />
            <ModeSwitch mode={mode} />
            <span className={styles.profile}>
              {clerkConfigured() ? <ProfileMenu /> : <Link href="/sign-in" className={styles.signInLink}>Sign in</Link>}
            </span>
          </span>
        }
      />
      <div className={styles.body}>
        <div className={styles.rail}>
          <WorkspaceRail
            sections={sections}
            {...(activeKey ? { activeKey } : {})}
            ariaLabel={navLabel ?? "Workspace"}
          />
        </div>
        <div className={styles.mainWrap}>
          <div className={styles.mobileBar}>
            <MobileNav
              sections={sections}
              {...(activeKey ? { activeKey } : {})}
              ariaLabel={navLabel ?? "Workspace"}
            />
            <span className={styles.mobileWorkspace}>{workspaceName}</span>
            <span className={styles.mobileMode} title={MODE_DESCRIPTION[mode]}>
              {mode === "builder" ? "Builder" : "Developer"}
            </span>
          </div>
          <main id="hc-content" className={styles.main} tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
      <div id="hc-live" aria-live="polite" className={styles.live} />
    </div>
  );
}
