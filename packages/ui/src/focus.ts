/**
 * Pure focus/keyboard helpers — kept DOM-free so they are unit-testable
 * in a node environment and reusable across modal, tabs and menus.
 */

/** Elements treated as keyboard-focusable inside overlays and widgets. */
export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * Given the index of the currently focused element inside a focus trap,
 * return the index that should receive focus for a Tab traversal.
 * Wraps in both directions; `count <= 0` yields -1 (nothing to focus).
 */
export function nextTrapIndex(current: number, count: number, direction: 1 | -1): number {
  if (count <= 0) return -1;
  if (current < 0) return direction === 1 ? 0 : count - 1;
  return (current + direction + count) % count;
}

/**
 * Roving-tabindex navigation for tabs/toolbars. Home/End jump to the
 * first/last enabled item; arrows move by orientation and skip
 * disabled entries. Returns the index to activate, or `current` when
 * the key is not handled.
 */
export function rovingIndex(
  current: number,
  count: number,
  key: string,
  orientation: "horizontal" | "vertical" = "horizontal",
  disabled: ReadonlyArray<boolean> = [],
): number {
  if (count <= 0) return current;
  const forwardKey = orientation === "horizontal" ? "ArrowRight" : "ArrowDown";
  const backKey = orientation === "horizontal" ? "ArrowLeft" : "ArrowUp";

  const isEnabled = (i: number) => !disabled[i];
  const step = (from: number, dir: 1 | -1): number => {
    for (let n = 1; n <= count; n++) {
      const i = (from + dir * n + count * n) % count;
      if (isEnabled(i)) return i;
    }
    return from;
  };

  if (key === forwardKey) return step(current < 0 ? 0 : current, 1);
  if (key === backKey) return step(current < 0 ? count - 1 : current, -1);
  if (key === "Home") {
    for (let i = 0; i < count; i++) if (isEnabled(i)) return i;
    return current;
  }
  if (key === "End") {
    for (let i = count - 1; i >= 0; i--) if (isEnabled(i)) return i;
    return current;
  }
  return current;
}
