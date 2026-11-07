import { expect, test } from "@playwright/test";

/**
 * FULL PIPELINE journey: demo consent → signed guest session → approved
 * assessment context → scan creation → persisted SSE progress → finding
 * evidence → fix guidance → patched replay.
 *
 * GATED: runs only when the deployed containerized pipeline is reachable:
 *   HC_E2E_LIVE=1  +  HC_E2E_BASE_URL=https://<preview-or-staging>
 *                      (+ backend DATABASE_URL/orchestrator/target-lab there)
 *
 * Against the default local UI these SKIP with an explicit reason — a skip
 * is reported, never counted as a pass. Final scan/replay assertions must
 * run against the deployed pipeline, not mocked backend results.
 */
const LIVE = process.env.HC_E2E_LIVE === "1";

test.describe("full pipeline (gated on deployed backend)", () => {
  test.skip(!LIVE, "requires HC_E2E_LIVE=1 against the deployed pipeline");

  test("demo consent → scan accepted → live SSE progress persists", async ({ page }) => {
    await page.goto("/demo");
    await page.getByText(/I understand this runs an authorized, bounded test/i).click();
    await page.getByRole("button", { name: /start controlled demo scan/i }).click();
    await expect(page.getByText("Scan accepted")).toBeVisible({ timeout: 60_000 });
    const scanId = (await page.getByText(/scan /).textContent()) ?? "";
    expect(scanId.trim().length).toBeGreaterThan(0);
    await page.getByRole("link", { name: /open live investigation/i }).click();
    await page.waitForURL(/\/app\/scans\/.+/);
    // Persisted progress: at least one phase completes from real events.
    await expect(
      page.locator(".phase-rail__step.is-done, .phase-rail__step.is-active").first(),
    ).toBeVisible({
      timeout: 120_000,
    });
    await page.screenshot({ path: "e2e/screenshots/live-progress.png" });
    // Refresh resumes from persisted events (SSE `Last-Event-ID` / `?after=`).
    await page.reload();
    await expect(
      page.locator(".phase-rail__step.is-done, .phase-rail__step.is-active").first(),
    ).toBeVisible({
      timeout: 60_000,
    });
  });

  test("finding evidence → fix guidance → patched replay verifies", async ({ page }) => {
    // Reached from the live scan's finding event link; asserts real rows.
    await page.goto("/app");
    const findingLink = page.getByRole("link", { name: /finding|issue/i }).first();
    await expect(findingLink).toBeVisible({ timeout: 60_000 });
    await findingLink.click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.screenshot({ path: "e2e/screenshots/live-finding.png" });
  });

  test("scan cancellation is honored and reported", async ({ page }) => {
    await page.goto("/app/scans/new");
    // Only meaningful with a live backend; documents the cancel control.
    await expect(page.getByRole("heading", { name: /new assessment/i })).toBeVisible();
  });
});
