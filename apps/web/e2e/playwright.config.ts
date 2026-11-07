import { defineConfig, devices } from "@playwright/test";

/**
 * HighCastle browser E2E (Engineer 4 / F4).
 *
 * Two modes, selected by environment — local UI vs live acceptance:
 *
 * - Local (default): exercises the real UI against a local production
 *   bundle. `pnpm build` first; the `next start` server on :3119 starts
 *   automatically. No database, orchestrator, or Vultr credentials needed —
 *   tests assert honest UI states for each backend condition.
 * - Live (`HC_E2E_LIVE=1` + `HC_E2E_BASE_URL=https://<deployed>`): the same
 *   public-journey specs run as deployment smoke, and `journey-live.spec.ts`
 *   executes the full pipeline (scan → persisted SSE → finding → fix →
 *   patched replay, cancellation) against the deployed containerized
 *   backend. The local web server is disabled in this mode.
 *
 * Browser: Playwright's default Chromium. Override only when the default
 * is unavailable: `HC_CHROME=/path/to/chrome-or-headless-shell`.
 *
 * Run:  pnpm exec playwright test -c e2e/playwright.config.ts
 * Live: HC_E2E_LIVE=1 HC_E2E_BASE_URL=https://<staging> \
 *         pnpm exec playwright test -c e2e/playwright.config.ts
 */
const EXTERNAL_BASE = (process.env.HC_E2E_BASE_URL ?? "").replace(/\/$/, "") || null;
const LOCAL_PORT = 3119;

if (process.env.HC_E2E_LIVE === "1" && EXTERNAL_BASE === null) {
  throw new Error("HC_E2E_LIVE=1 requires HC_E2E_BASE_URL=https://<deployed-pipeline>");
}

export default defineConfig({
  testDir: "./specs",
  outputDir: "./test-results",
  fullyParallel: false,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "./report", open: "never" }]],
  use: {
    baseURL: EXTERNAL_BASE ?? `http://127.0.0.1:${LOCAL_PORT}`,
    launchOptions: process.env.HC_CHROME ? { executablePath: process.env.HC_CHROME } : {},
  },
  // No local server for externally deployed runs.
  ...(EXTERNAL_BASE
    ? {}
    : {
        webServer: {
          command: `pnpm start --port ${LOCAL_PORT}`,
          url: `http://127.0.0.1:${LOCAL_PORT}/healthz`,
          reuseExistingServer: true,
          timeout: 180_000,
          env: {
            NODE_ENV: "production",
            // Local-only signing secret so the production bundle can mint
            // demo sessions (production fails closed without one). Never a
            // real secret.
            BETTER_AUTH_SECRET: "e2e-local-only-insecure-secret",
          },
        },
      }),
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
