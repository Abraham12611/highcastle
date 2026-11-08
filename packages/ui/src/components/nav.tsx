"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";
import { cx } from "../cx.js";
import { Icon, type IconName } from "../icons.js";
import { FortressMark } from "./logo.js";

/**
 * Navigation primitives. Links are rendered as plain anchors by
 * default; pass `renderItem` to swap in a framework Link component
 * (e.g. next/link) without this package depending on a router.
 */

export interface TopBarProps {
  /** Brand slot — defaults to the fortress mark + wordmark. */
  brand?: ReactNode;
  /** Right-aligned actions (workspace picker, mode toggle, profile). */
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function TopBar({ brand, actions, children, className }: TopBarProps) {
  return (
    <header className={cx("hc-topbar", className)}>
      <span className="hc-topbar-brand">
        {brand ?? (
          <>
            <FortressMark size={26} label={null} />
            <span className="hc-logo-word">HighCastle</span>
          </>
        )}
      </span>
      {children}
      <span className="hc-topbar-spacer" />
      {actions}
    </header>
  );
}

export interface NavItemData {
  key: string;
  label: string;
  href: string;
  icon?: IconName;
  /** Optional right-side count (findings, open scans). */
  badge?: ReactNode;
}

export interface NavSectionData {
  key: string;
  label?: string;
  items: NavItemData[];
}

export interface NavRailProps {
  sections: NavSectionData[];
  /** key of the active item — controls aria-current="page". */
  activeKey?: string;
  /** Icon-only 64px rail; labels are still exposed via title + aria. */
  collapsed?: boolean;
  header?: ReactNode;
  footer?: ReactNode;
  renderItem?: (item: NavItemData, props: AnchorHTMLAttributes<HTMLAnchorElement>) => ReactNode;
  className?: string;
  "aria-label"?: string;
}

/**
 * Compact dark left rail (authenticated shell). On mobile, host it in
 * the Drawer primitive and keep the same item model.
 */
export function NavRail({
  sections,
  activeKey,
  collapsed = false,
  header,
  footer,
  renderItem,
  className,
  "aria-label": ariaLabel = "Workspace",
}: NavRailProps) {
  return (
    <div className={cx("hc-rail", collapsed && "hc-rail--collapsed", className)}>
      {header}
      <nav aria-label={ariaLabel} style={{ flex: 1 }}>
        {sections.map((section) => (
          <div key={section.key}>
            {section.label ? (
              <p className="hc-rail-section">
                {collapsed ? section.label.slice(0, 2) : section.label}
              </p>
            ) : null}
            <div className="hc-rail-nav">
              {section.items.map((item) => {
                const active = item.key === activeKey;
                const anchorProps: AnchorHTMLAttributes<HTMLAnchorElement> = {
                  href: item.href,
                  className: cx("hc-nav-item", active && "hc-nav-item--active"),
                  title: collapsed ? item.label : undefined,
                  "aria-current": active ? "page" : undefined,
                };
                const inner = (
                  <>
                    {item.icon ? <Icon name={item.icon} size={16} /> : null}
                    <span className="hc-nav-item-label">{item.label}</span>
                    {item.badge ? <span className="hc-nav-item-badge">{item.badge}</span> : null}
                  </>
                );
                return renderItem ? (
                  <span key={item.key}>{renderItem(item, anchorProps)}</span>
                ) : (
                  <a key={item.key} {...anchorProps}>
                    {inner}
                  </a>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      {footer}
    </div>
  );
}
