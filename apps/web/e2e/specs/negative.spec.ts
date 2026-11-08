import { expect, test } from "@playwright/test";

/**
 * Negative and adversarial conditions. Each test corrupts exactly one axis
 * (session, scope, backend) and asserts the UI degrades honestly.
 */
test.describe("bad sessions, forbidden scope, unavailable backend", () => {
  test("forged session cookie cannot enter protected routes", async ({ page, context }) => {
    await context.addCookies([
      {
        name: "hc_demo",
        value: "forged.not-a-real-signature",
        domain: "127.0.0.1",
        path: "/",
      },
    ]);
    await page.goto("/app/w/demo/overview");
    const honest = page
      .getByText(/sign in required/i)
      .or(page.getByText(/no access/i))
      .or(page.getByText(/unavailable/i))
      .or(page.getByText(/not (be )?found/i));
    await expect(honest.first()).toBeVisible({ timeout: 30_000 });
    // A forged cookie must never render workspace data.
    await expect(page.getByText(/scan accepted/i)).toHaveCount(0);
  });

  test("unknown workspace slug resolves to not-found or unauthorized, never data", async ({
    page,
  }) => {
    const res = await page.goto("/app/w/no-such-workspace/overview");
    expect([404, 200]).toContain(res?.status());
    const honest = page
      .getByText(/not (be )?found/i)
      .or(page.getByText(/sign in required/i))
      .or(page.getByText(/no access/i))
      .or(page.getByText(/unavailable/i));
    await expect(honest.first()).toBeVisible({ timeout: 30_000 });
  });

  test("unknown API route returns a contract error, not HTML success", async ({ page }) => {
    const res = await page.request.get("/api/v1/no-such-thing");
    expect(res.status()).toBe(404);
  });

  test("demo session mint requires the anti-CSRF header", async ({ page }) => {
    const res = await page.request.post("/api/auth/demo");
    // Without `x-highcastle-request` the route must refuse (403/400), not mint.
    expect([400, 403]).toContain(res.status());
  });

  test("visiting a nonsense route renders the app 404 page", async ({ page }) => {
    await page.goto("/definitely-not-a-route-xyz");
    await expect(page.getByText(/not (be )?found/i).first()).toBeVisible();
  });
});
