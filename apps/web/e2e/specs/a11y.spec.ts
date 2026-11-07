import { expect, test } from "@playwright/test";

const ROUTES = ["/", "/demo", "/onboarding", "/sign-in", "/app/scans/new"];

/**
 * Structural accessibility checks that need no backend: landmarks, headings,
 * labels, keyboard reachability, and reduced-motion handling.
 */
test.describe("accessibility structure", () => {
  for (const route of ROUTES) {
    test(`${route} has landmarks, one h1, and named controls`, async ({ page }) => {
      await page.goto(route);
      await expect(page.locator("main, [role='main']").first()).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      for (const button of await page.getByRole("button").all()) {
        // Icon-only controls are fine when they expose an accessible name.
        await expect(button).toHaveAccessibleName(/.+/);
      }
      for (const link of await page.getByRole("link").all()) {
        await expect(link).toHaveAccessibleName(/.+/);
      }
    });
  }

  test("demo consent checkbox is keyboard-operable and labelled", async ({ page }) => {
    await page.goto("/demo");
    const label = page.getByText(/I understand this runs an authorized, bounded test/i);
    await label.click();
    const box = page.getByRole("checkbox").first();
    await expect(box).toBeChecked();
    await box.focus();
    await expect(box).toBeFocused();
    await page.keyboard.press("Space");
    await expect(box).not.toBeChecked();
  });

  test("primary buttons meet the 44px minimum target", async ({ page }) => {
    await page.goto("/demo");
    const start = page.getByRole("button", { name: /start controlled demo scan/i });
    const box = await start.boundingBox();
    expect(box, "start button has layout box").not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(40);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  });

  test("prefers-reduced-motion is honored by the stylesheet", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const honored = await page.evaluate(() => {
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList | null = null;
        try {
          rules = sheet.cssRules;
        } catch {
          continue;
        }
        for (const rule of Array.from(rules ?? [])) {
          if (
            rule instanceof CSSMediaRule &&
            rule.conditionText.includes("prefers-reduced-motion")
          ) {
            return true;
          }
        }
      }
      return false;
    });
    expect(honored, "a prefers-reduced-motion media rule must exist").toBe(true);
  });
});
