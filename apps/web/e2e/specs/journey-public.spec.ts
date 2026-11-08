import { expect, test } from "@playwright/test";

/**
 * Public journey against the REAL UI with no backend services.
 * Every assertion names the route, the expected UI, and the reason —
 * a reproducible failure report, not just a red test.
 * Screenshots are suffixed per viewport project so desktop and mobile
 * evidence never overwrite each other.
 */
test.describe("landing and demo (no backend)", () => {
  test("landing `/` renders hero and links the controlled demo", async ({ page }, testInfo) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    const cta = page.getByRole("link", { name: /controlled demo/i }).first();
    await expect(cta).toBeVisible();
    expect(await cta.getAttribute("href")).toBe("/demo");
    await page.screenshot({ path: `e2e/screenshots/landing-${testInfo.project.name}.png` });
  });

  test("demo `/demo` gates scan start behind explicit consent", async ({ page }, testInfo) => {
    await page.goto("/demo");
    await expect(page.getByRole("heading", { name: /authorized test run/i })).toBeVisible();
    // Scope panel names the owned synthetic target — never an arbitrary host.
    await expect(
      page.getByText("target-lab (HighCastle-owned synthetic invoice app)"),
    ).toBeVisible();
    await expect(page.getByText("bola-invoice-v1").first()).toBeVisible();

    const start = page.getByRole("button", { name: /start controlled demo scan/i });
    await expect(start).toBeDisabled();
    await page.getByText(/I understand this runs an authorized, bounded test/i).click();
    await expect(start).toBeEnabled();
    await page.screenshot({ path: `e2e/screenshots/demo-consent-${testInfo.project.name}.png` });
  });

  test("demo consent flow uses the real session endpoint, surfaces real errors", async ({
    page,
  }, testInfo) => {
    await page.goto("/demo");
    await page.getByText(/I understand this runs an authorized, bounded test/i).click();
    // Session minting needs no DB; the assessment-context read that follows
    // does. Either the scan is accepted (healthy backend) or the UI shows the
    // API's real failure — never invented success. Scope to the consent
    // panel: Next's route announcer also carries role=alert and would match
    // vacuously.
    await page.getByRole("button", { name: /start controlled demo scan/i }).click();
    const panel = page.locator("main");
    const accepted = panel.getByText("Scan accepted");
    const failed = panel.getByText(/session failed|context failed|scan failed/i);
    await expect(accepted.or(failed)).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: `e2e/screenshots/demo-after-start-${testInfo.project.name}.png` });
  });

  test("get-started `/get-started` dashboard entry gates signed-out visitors", async ({
    page,
  }, testInfo) => {
    // Post-#93/#96 the entry is account-first (E6's ui-shell test covers the
    // page copy, links, styling and overflow). This test owns the navigation
    // outcome: the "Open dashboard" skip link must land in the protected
    // shell, which honestly gates signed-out visitors — never workspace data.
    await page.goto("/get-started");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      /security testing starts/i,
    );
    const entry = page.getByRole("link", { name: /open dashboard/i });
    await expect(entry).toBeVisible();
    expect(await entry.getAttribute("href"), "entry links into the protected app").toBe("/app");
    await entry.click();
    await expect(
      page.getByText(/sign in required|no access|unavailable|no workspaces available/i).first(),
    ).toBeVisible({ timeout: 30_000 });
    await page.screenshot({
      path: `e2e/screenshots/get-started-dashboard-gate-${testInfo.project.name}.png`,
    });
  });

  test("onboarding `/onboarding` offers evidence modes without fake data", async ({ page }) => {
    await page.goto("/onboarding");
    await expect(page.getByRole("heading", { name: /welcome to highcastle/i })).toBeVisible();
    await expect(page.getByText(/owned synthetic target/i).first()).toBeVisible();
  });

  test("sign-in `/sign-in` discloses account state, offers guest session", async ({
    page,
  }, testInfo) => {
    // Post-#66 (Clerk): <h2>Sign in</h2> shell with the guest demo entry.
    // The configured-vs-unconfigured account copy depends on deployment env
    // keys, so assert only the stable parts: the heading, the guest-session
    // explainer, and the demo entry button.
    await page.goto("/sign-in");
    await expect(page.getByRole("heading", { name: /^sign in$/i })).toBeVisible();
    await expect(page.getByText(/limited guest session — no account needed/i)).toBeVisible();
    const entry = page.getByRole("button", { name: /try the live demo/i });
    await expect(entry).toBeVisible();
    await page.screenshot({ path: `e2e/screenshots/sign-in-${testInfo.project.name}.png` });
  });

  test("public routes render one header, styled CSS, no horizontal overflow", async ({
    page,
  }) => {
    // Layout acceptance (desktop + mobile via viewport projects): every
    // public route loads stylesheets, exposes exactly one h1, and never
    // scrolls sideways. Buttons/inputs inherit the design-system styling
    // through the loaded CSS — unstyled bare markup would fail the h1 and
    // overflow guards on at least one viewport.
    for (const route of ["/", "/demo", "/get-started", "/onboarding", "/sign-in", "/sign-up"]) {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      const css = await page.evaluate(() => document.styleSheets.length);
      expect(css, `${route} loads stylesheets`).toBeGreaterThan(0);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, `${route} has no horizontal scrollbar`).toBeLessThanOrEqual(1);
    }
  });

  test("guest entry mints a server session and forwards to /demo", async ({ page }) => {
    await page.goto("/sign-in");
    const res = page.waitForResponse(
      (r) => r.url().includes("/api/auth/demo") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: /try the live demo/i }).click();
    const response = await res;
    expect(response.ok()).toBe(true);
    await page.waitForURL("**/demo");
  });
});
