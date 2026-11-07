import { expect, test } from "@playwright/test";

/**
 * Public journey against the REAL UI with no backend services.
 * Every assertion names the route, the expected UI, and the reason —
 * a reproducible failure report, not just a red test.
 */
test.describe("landing and demo (no backend)", () => {
  test("landing `/` renders hero and links the controlled demo", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    const cta = page.getByRole("link", { name: /controlled demo/i }).first();
    await expect(cta).toBeVisible();
    expect(await cta.getAttribute("href")).toBe("/demo");
    await page.screenshot({ path: "e2e/screenshots/landing.png" });
  });

  test("demo `/demo` gates scan start behind explicit consent", async ({ page }) => {
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
    await page.screenshot({ path: "e2e/screenshots/demo-consent.png" });
  });

  test("demo consent flow uses the real session endpoint, surfaces real errors", async ({
    page,
  }) => {
    await page.goto("/demo");
    await page.getByText(/I understand this runs an authorized, bounded test/i).click();
    // Session minting needs no DB; the assessment-context read that follows
    // does. Either the scan is accepted (healthy backend) or the UI shows the
    // API's real failure — never invented success.
    await page.getByRole("button", { name: /start controlled demo scan/i }).click();
    const accepted = page.getByText("Scan accepted");
    const failed = page.getByRole("alert").first();
    await expect(accepted.or(failed)).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: "e2e/screenshots/demo-after-start.png" });
  });

  test("onboarding `/onboarding` offers evidence modes without fake data", async ({ page }) => {
    await page.goto("/onboarding");
    await expect(page.getByRole("heading", { name: /welcome to highcastle/i })).toBeVisible();
    await expect(page.getByText(/owned synthetic target/i).first()).toBeVisible();
  });

  test("sign-in `/sign-in` discloses deferred accounts, offers guest session", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByText(/not part of the hackathon demo build/i)).toBeVisible();
    const entry = page.getByRole("button", { name: /try the live demo/i });
    await expect(entry).toBeVisible();
    await page.screenshot({ path: "e2e/screenshots/sign-in.png" });
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
