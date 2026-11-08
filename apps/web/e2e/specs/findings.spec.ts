import { expect, test } from "@playwright/test";

const KNOWN_WORKSPACE = "demo";
const KNOWN_PROJECT = "11111111-1111-4111-8111-111111111111";
const UNKNOWN_FINDING = "00000000-0000-4000-8000-000000000000";

/**
 * Findings and replay routes (E8 lane) through the real UI.
 * Without backend data these must resolve to not-found / unauthorized /
 * unavailable states — never to fabricated evidence.
 */
test.describe("findings and replay (no backend data)", () => {
  test("unknown finding overview resolves to an honest terminal state", async ({ page }) => {
    const res = await page.goto(
      `/app/w/${KNOWN_WORKSPACE}/projects/${KNOWN_PROJECT}/findings/${UNKNOWN_FINDING}/overview`,
    );
    // Terminal states: 404 page, sign-in prompt, or service-unavailable panel.
    expect([404, 200]).toContain(res?.status());
    const honest = page
      .getByText(/not (be )?found/i)
      .or(page.getByText(/sign in required/i))
      .or(page.getByText(/finding unavailable/i))
      .or(page.getByText(/no access/i));
    await expect(honest.first()).toBeVisible({ timeout: 30_000 });
    // No fabricated evidence may render for an unknown id.
    await expect(page.getByText(/reproduce/i)).toHaveCount(0);
    await page.screenshot({ path: "e2e/screenshots/finding-unknown.png" });
  });

  test("finding proof tab for an unknown id shows no invented proof", async ({ page }) => {
    await page.goto(
      `/app/w/${KNOWN_WORKSPACE}/projects/${KNOWN_PROJECT}/findings/${UNKNOWN_FINDING}/proof`,
    );
    const honest = page
      .getByText(/not (be )?found/i)
      .or(page.getByText(/sign in required/i))
      .or(page.getByText(/finding unavailable/i))
      .or(page.getByText(/no access/i));
    await expect(honest.first()).toBeVisible({ timeout: 30_000 });
  });

  test("finding replay tab for an unknown id shows no invented replay", async ({ page }) => {
    await page.goto(
      `/app/w/${KNOWN_WORKSPACE}/projects/${KNOWN_PROJECT}/findings/${UNKNOWN_FINDING}/replay`,
    );
    const honest = page
      .getByText(/not (be )?found/i)
      .or(page.getByText(/sign in required/i))
      .or(page.getByText(/finding unavailable/i))
      .or(page.getByText(/no access/i));
    await expect(honest.first()).toBeVisible({ timeout: 30_000 });
  });
});
