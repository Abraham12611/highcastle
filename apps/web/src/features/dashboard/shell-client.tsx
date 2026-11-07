"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import {
  Drawer,
  Icon,
  IconButton,
  NavRail,
  type NavItemData,
  type NavSectionData,
} from "@highcastle/ui";
import { MODE_COOKIE, MODE_LABEL, type ExperienceMode } from "./mode";
import styles from "./shell.module.css";

/**
 * Client interactivity for the protected shell: framework-aware rail links,
 * the mobile navigation drawer, the Builder/Developer mode switch and the
 * workspace switcher. Server components pass plain data — no function props.
 */

function railItem(item: NavItemData, props: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <Link
      href={item.href}
      className={props.className}
      title={props.title}
      aria-current={props["aria-current"]}
    >
      {item.icon ? <Icon name={item.icon} size={16} /> : null}
      <span className="hc-nav-item-label">{item.label}</span>
      {item.badge ? <span className="hc-nav-item-badge">{item.badge}</span> : null}
    </Link>
  );
}

function useCollapsedRail(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia("(max-width: 1279px)");
      query.addEventListener("change", notify);
      return () => query.removeEventListener("change", notify);
    },
    () => window.matchMedia("(max-width: 1279px)").matches,
    () => false,
  );
}

export function WorkspaceRail({
  sections,
  activeKey,
  ariaLabel,
}: {
  sections: NavSectionData[];
  activeKey?: string | undefined;
  ariaLabel?: string | undefined;
}) {
  const collapsed = useCollapsedRail();
  return (
    <NavRail
      sections={sections}
      {...(activeKey ? { activeKey } : {})}
      collapsed={collapsed}
      {...(ariaLabel ? { "aria-label": ariaLabel } : {})}
      renderItem={railItem}
    />
  );
}

export function MobileNav({
  sections,
  activeKey,
  ariaLabel,
}: {
  sections: NavSectionData[];
  activeKey?: string | undefined;
  ariaLabel?: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <span className={styles.menuButton}>
        <IconButton icon="menu" label="Open navigation" onClick={() => setOpen(true)} />
      </span>
      <Drawer open={open} onClose={() => setOpen(false)} title="Workspace navigation">
        <div onClick={() => setOpen(false)}>
          <WorkspaceRail sections={sections} activeKey={activeKey} ariaLabel={ariaLabel} />
        </div>
      </Drawer>
    </>
  );
}

/** Builder/Developer presentation switch — cookie + refresh, route preserved. */
export function ModeSwitch({ mode }: { mode: ExperienceMode }) {
  const router = useRouter();
  const next: ExperienceMode = mode === "builder" ? "developer" : "builder";
  return (
    <button
      type="button"
      className={styles.modeSwitch}
      role="switch"
      aria-checked={mode === "developer"}
      aria-label={`Experience mode: ${MODE_LABEL[mode]}. Activate to switch to ${MODE_LABEL[next]}.`}
      title={
        mode === "builder"
          ? "Builder mode: plain-language summaries"
          : "Developer mode: full evidence detail"
      }
      onClick={() => {
        document.cookie = `${MODE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
      }}
    >
      <span className={styles.modeTrack} aria-hidden="true">
        <span className={styles.modeThumb} data-mode={mode} />
      </span>
      <span className={styles.modeLabel}>{MODE_LABEL[mode]}</span>
    </button>
  );
}

/** Workspace picker — plain navigation, invalidates cross-workspace state. */
export function WorkspaceSwitcher({
  workspaces,
  currentSlug,
}: {
  workspaces: { slug: string; name: string }[];
  currentSlug: string;
}) {
  const router = useRouter();
  return (
    <label className={styles.workspaceSwitcher}>
      <span className={styles.srOnly}>Current workspace</span>
      <select
        aria-label="Current workspace"
        className={styles.workspaceSelect}
        value={currentSlug}
        onChange={(event) => {
          const slug = event.target.value;
          if (slug && slug !== currentSlug) router.push(`/app/w/${slug}/overview`);
        }}
      >
        {workspaces.map((workspace) => (
          <option key={workspace.slug} value={workspace.slug}>
            {workspace.name}
          </option>
        ))}
      </select>
    </label>
  );
}
