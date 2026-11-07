import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HC_COLORS } from "./tokens.js";

/**
 * Token parity: tokens.css (:root vars), theme.css (@theme vars) and
 * HC_COLORS must carry the same hex values — drift breaks either the
 * plain-CSS or the Tailwind path.
 */

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

const tokensCss = read("./styles/tokens.css");
const themeCss = read("./styles/theme.css");

const kebab = (name: string) => name.replace(/([A-Z0-9])/g, (m) => `-${m.toLowerCase()}`);

const cssVar = (name: string) => `--hc-${kebab(name)}`;

const themeVar = (name: string) => `--color-hc-${kebab(name)}`;

describe("design tokens", () => {
  it.each(Object.entries(HC_COLORS))("tokens.css defines %s with the TS hex value", (name, hex) => {
    expect(tokensCss).toContain(`${cssVar(name)}: ${hex.toLowerCase()};`);
  });

  it.each(Object.entries(HC_COLORS))(
    "theme.css exposes %s to Tailwind with the same hex",
    (name, hex) => {
      expect(themeCss).toContain(`${themeVar(name)}: ${hex.toLowerCase()};`);
    },
  );

  it("keeps the canonical palette from the design spec", () => {
    expect(HC_COLORS.bg).toBe("#080D1A");
    expect(HC_COLORS.primary).toBe("#62F5D1");
    expect(HC_COLORS.violet).toBe("#A48BFF");
    expect(HC_COLORS.cyan).toBe("#63CFFF");
    expect(HC_COLORS.coral).toBe("#FF708A");
  });
});
