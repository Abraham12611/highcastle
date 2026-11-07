import { describe, expect, it } from "vitest";
import { HC_COLORS } from "./tokens.js";

/**
 * WCAG 2.1 contrast verification for the shipped palette.
 * Ratios are computed, not asserted from memory: body text and status
 * label combinations must clear 4.5:1 (AA normal text).
 */

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const r = srgbToLinear(parseInt(hex.slice(1, 3), 16));
  const g = srgbToLinear(parseInt(hex.slice(3, 5), 16));
  const b = srgbToLinear(parseInt(hex.slice(5, 7), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Composite an alpha-washed accent over a base surface hex. */
function over(fgHex: string, alpha: number, bgHex: string): string {
  const ch = (i: number) => parseInt(fgHex.slice(i, i + 2), 16);
  const cb = (i: number) => parseInt(bgHex.slice(i, i + 2), 16);
  const mix = (i: number) =>
    Math.round(ch(i) * alpha + cb(i) * (1 - alpha))
      .toString(16)
      .padStart(2, "0");
  return `#${mix(1)}${mix(3)}${mix(5)}`;
}

function ratio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)];
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

const SURFACES = ["bg", "surface1", "surface2"] as const;

describe("WCAG contrast — body text", () => {
  it.each(SURFACES)("main text on %s >= 12:1", (surface) => {
    expect(ratio(HC_COLORS.text, HC_COLORS[surface])).toBeGreaterThanOrEqual(12);
  });
  it.each(SURFACES)("muted text on %s >= 6.5:1", (surface) => {
    expect(ratio(HC_COLORS.muted, HC_COLORS[surface])).toBeGreaterThanOrEqual(6.5);
  });
  it.each(SURFACES)("subtle metadata on %s >= 4.5:1", (surface) => {
    expect(ratio(HC_COLORS.subtle, HC_COLORS[surface])).toBeGreaterThanOrEqual(4.5);
  });
});

describe("WCAG contrast — status label on its tinted wash (over surface-1)", () => {
  const cases: Array<[string, keyof typeof HC_COLORS, number]> = [
    ["primary", "primary", 0.12],
    ["success", "success", 0.12],
    ["cyan", "cyan", 0.12],
    ["violet", "violet", 0.12],
    ["coral", "coral", 0.13],
    ["orange", "orange", 0.12],
    ["amber", "amber", 0.1],
    ["low (slate labels)", "low", 0.1],
  ];
  it.each(cases)("%s label >= 4.5:1", (_label, color, alpha) => {
    const washBg = over(HC_COLORS[color], alpha, HC_COLORS.surface1);
    expect(ratio(HC_COLORS[color], washBg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("WCAG contrast — interactive fills", () => {
  it("primary button ink on mint fill", () => {
    expect(ratio(HC_COLORS.primaryInk, HC_COLORS.primary)).toBeGreaterThanOrEqual(4.5);
  });
  it("focus ring stands out on page bg", () => {
    expect(ratio(HC_COLORS.focus, HC_COLORS.bg)).toBeGreaterThanOrEqual(7);
  });
});
