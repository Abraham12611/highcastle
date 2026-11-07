import { expect, test } from "@playwright/test";

/**
 * Scan routes (E5 lane) exercised through the real UI.
 * Without a database the wizard/SSE paths must fail honestly; the suite
 * asserts the failure contract rather than manufacturing executions.
 */
test.describe("scan creation and live progress", () => {
  test("`/app/scans/new` wizard names the authorization boundary", async ({ page }) => {
    await page.goto("/app/scans/new");
    await expect(page.getByRole("heading", { name: /new assessment/i })).toBeVisible();
    await expect(
      page.getByText(/bounded, authorized checks against owned synthetic targets only/i),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /start authorized scan/i })).toBeDisabled();
    await page.screenshot({ path: "e2e/screenshots/scan-new.png" });
  });

  test("wizard reports the real context error (no invented targets)", async ({ page }) => {
    await page.goto("/app/scans/new");
    // Without a session the context read fails closed. The UI must surface
    // the API error verbatim (Next's route announcer also carries role=alert,
    // so scope to the wizard's own callout) and must not render target cards
    // or enable submission.
    const alert = page.locator(".scan-wizard .hc-callout--danger");
    await expect(alert).toBeVisible({ timeout: 30_000 });
    await expect(alert).toContainText(/could not load authorized targets/i);
    await expect(page.getByRole("button", { name: /start authorized scan/i })).toBeDisabled();
    await expect(page.locator(".target-card")).toHaveCount(0);
  });

  test("even an authorized demo session cannot load the wizard (slug rejected)", async ({
    page,
  }) => {
    // Mint a real server session, install its cookie, then load the wizard.
    // Without DATABASE_URL the read fails at the DB gate with the verbatim
    // reason. NOTE (E5): the live route passes the "invoice-demo" slug where
    // the API requires a UUID — once a database is present the next failure
    // will be `invalid project id`. No target cards, no enabled submission.
    const mint = await page.request.post("/api/auth/demo", {
      headers: { "x-highcastle-request": "1" },
    });
    expect(mint.ok()).toBe(true);
    const storage = await page.request.storageState();
    const demo = storage.cookies.find((c) => c.name === "hc_demo");
    expect(demo, "server sets the demo session cookie").toBeDefined();
    await page.goto("/app/scans/new");
    const alert = page.locator(".scan-wizard .hc-callout--danger");
    await expect(alert).toBeVisible({ timeout: 30_000 });
    await expect(alert).toContainText(/database is not configured/i);
    await expect(page.getByRole("button", { name: /start authorized scan/i })).toBeDisabled();
    await expect(page.locator(".target-card")).toHaveCount(0);
  });

  test("unknown scan `/app/scans/:id` fails closed on SSE, survives refresh", async ({ page }) => {
    const scanId = "00000000-0000-4000-8000-000000000000";
    await page.goto(`/app/scans/${scanId}`);
    await expect(page.getByRole("heading", { name: /live investigation/i })).toBeVisible();
    const terminal = page.getByText(/stream (failed|closed)/i).or(page.getByRole("alert"));
    await expect(terminal.first()).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: "e2e/screenshots/scan-unknown.png" });
    // Refresh must not lose the failure or fabricate progress.
    await page.reload();
    await expect(page.getByRole("heading", { name: /live investigation/i })).toBeVisible();
    await expect(terminal.first()).toBeVisible({ timeout: 30_000 });
    await expect(
      page.locator(".phase-rail__step.is-active, .phase-rail__step.is-done"),
    ).toHaveCount(0);
  });
});
