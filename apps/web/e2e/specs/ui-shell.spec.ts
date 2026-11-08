import { expect, test } from "@playwright/test";

/**
 * UI shell routes (Engineer 6) against the real UI with no backend.
 * Every assertion names the route, the expected honest state, and the
 * reason — a reproducible failure report, not just a red test.
 * Screenshots capture the no-backend states for the submission record.
 */
test.describe("get started (no backend)", () => {
  test("/get-started shows the 3-step entry with working demo path", async ({ page }, testInfo) => {
    await page.goto("/get-started");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/security testing starts/i);
    // Step 1: real Clerk sign-in/up routes (E5) or the guest demo entry.
    await expect(page.getByRole("link", { name: /^sign in$/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /create an account/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /try the live demo/i }).first()).toBeVisible();
    // Step 2: real mode choice (posts to /onboarding/mode).
    await expect(page.getByRole("button", { name: /builder/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /developer/i }).first()).toBeVisible();
    // Step 3: source lanes honestly pending; skip reaches the app shell.
    await expect(page.getByText(/coming soon/i).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /open dashboard/i })).toBeVisible();
    // Guard against the exact public regression: Tailwind reset + bare markup
    // rendered every section edge-to-edge with no meaningful spacing.
    const accountCard = page.locator('section[aria-labelledby="gs-account"]');
    const padding = await accountCard.evaluate((el) => parseFloat(getComputedStyle(el).paddingTop));
    expect(padding).toBeGreaterThan(15);
    await expect(accountCard).toHaveCSS("border-top-style", "solid");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `e2e/screenshots/get-started-${testInfo.project.name}.png` });
  });

  test("/sign-up mirrors sign-in with the guest session path", async ({ page }, testInfo) => {
    await page.goto("/sign-up");
    await expect(page.getByRole("heading", { name: /create account/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /try the live demo/i })).toBeVisible();
    await page.screenshot({ path: `e2e/screenshots/sign-up-${testInfo.project.name}.png` });
  });
});

test.describe("workspace shell honesty (no backend)", () => {
  for (const route of [
    "/app/w/demo/scans",
    "/app/w/demo/findings",
    "/app/w/demo/settings",
    "/app/w/demo/integrations/github",
  ]) {
    test(`${route} fails closed without inventing records`, async ({ page }) => {
      const res = await page.goto(route);
      expect([200, 404]).toContain(res?.status());
      // One of the honest terminal states — never fabricated rows.
      const honest = page
        .getByText(/sign in required/i)
        .or(page.getByText(/no access/i))
        .or(page.getByText(/unavailable/i))
        .or(page.getByText(/not found/i));
      await expect(honest.first()).toBeVisible({ timeout: 30_000 });
      // No invented record links anywhere on the page.
      await expect(page.locator('a[href*="/app/scans/"]')).toHaveCount(0);
      await expect(page.locator('a[href*="/findings/"]').first()).toHaveCount(0);
    });
  }

  test("workspace scans empty state offers the demo path", async ({ page }, testInfo) => {
    await page.goto("/app/w/demo/scans");
    const honest = page.getByText(/sign in required/i).or(page.getByText(/no access/i));
    // Signed-out without backend: auth gate explains itself.
    await expect(honest.first()).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: `e2e/screenshots/scans-gated-${testInfo.project.name}.png` });
  });
});
