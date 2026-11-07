"use client";

import { useCallback, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { rovingIndex } from "../focus.js";

export interface TabItem {
  key: string;
  label: ReactNode;
  count?: number;
  disabled?: boolean;
  panel: ReactNode;
}

/**
 * Tabs with roving tabindex, arrow/Home/End navigation and standard
 * tablist/tab/tabpanel semantics. Uncontrolled by default; pass
 * `activeKey` + `onChange` to control.
 */
export function Tabs({
  items,
  activeKey,
  defaultKey,
  onChange,
  "aria-label": ariaLabel,
  className,
}: {
  items: TabItem[];
  activeKey?: string;
  defaultKey?: string;
  onChange?: (key: string) => void;
  "aria-label": string;
  className?: string;
}) {
  const uid = useId();
  const [internal, setInternal] = useState(
    defaultKey ?? items.find((t) => !t.disabled)?.key ?? items[0]?.key,
  );
  const current = activeKey ?? internal;
  const listRef = useRef<HTMLDivElement>(null);

  const select = useCallback(
    (key: string) => {
      if (activeKey === undefined) setInternal(key);
      onChange?.(key);
    },
    [activeKey, onChange],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const idx = items.findIndex((t) => t.key === current);
    const next = rovingIndex(
      idx,
      items.length,
      event.key,
      "horizontal",
      items.map((t) => t.disabled === true),
    );
    const tab = items[next];
    if (tab && !tab.disabled) {
      select(tab.key);
      listRef.current?.querySelector<HTMLButtonElement>(`[data-tab-key="${tab.key}"]`)?.focus();
    }
  };

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="hc-tabs-list"
        onKeyDown={onKeyDown}
        ref={listRef}
      >
        {items.map((tab) => {
          const selected = tab.key === current;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`${uid}-tab-${tab.key}`}
              data-tab-key={tab.key}
              aria-selected={selected}
              aria-controls={`${uid}-panel-${tab.key}`}
              tabIndex={selected ? 0 : -1}
              disabled={tab.disabled}
              className="hc-tab"
              onClick={() => select(tab.key)}
            >
              {tab.label}
              {tab.count !== undefined ? <span className="hc-tab-count">{tab.count}</span> : null}
            </button>
          );
        })}
      </div>
      {items.map((tab) => (
        <div
          key={tab.key}
          role="tabpanel"
          id={`${uid}-panel-${tab.key}`}
          aria-labelledby={`${uid}-tab-${tab.key}`}
          hidden={tab.key !== current}
          className="hc-tabs-panel"
          tabIndex={0}
        >
          {tab.key === current ? tab.panel : null}
        </div>
      ))}
    </div>
  );
}
