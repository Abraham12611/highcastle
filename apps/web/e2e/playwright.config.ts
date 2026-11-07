import { defineConfig, devices } from "@playwright/test";

/**
 * HighCastle browser E2E (Engineer 4 / F4).
 *
 * Runs the real UI in a real Chromium against `next dev`. No mocks, no
 * fixture data presented as live execution: tests assert what the UI shows
 * for each backend condition (healthy, misconfigured, unreachable).
 *
 * - Default run: everything that works WITHOUT a database, orchestrator,
 *   or Vultr credentials (public journey + honest failure states).
 * - Live pipeline cases (`journey-live.spec.ts`) run only with
 *   HC_E2E_LIVE=1 plus a reachable backend (DATABASE_URL, orchestrator,
 *   target-lab). They skip with a reason otherwise — a skip is not a pass.
 *
 * Run:  pnpm exec playwright test -c e2e/playwright.config.ts
 *         [from apps/web; dev server is started automatically on :3119]
 */
const SHELL =
  process.env.HC_CHROME ??
  `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell`;

export default defineConfig({
  testDir: "./specs",
  outputDir: "./test-results",
  fullyParallel: false,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "./report", open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3119",
    launchOptions: { executablePath: SHELL },
    screenshot: "only-on-failure",
    trace: "off",
    video: "off",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  webServer: {
    // Production server: run `pnpm build` first so the suite exercises the
    // deployed bundle (no Turbopack-dev artifacts in results/screenshots).
    command: "pnpm start --port 3119",
    url: "http://127.0.0.1:3119/healthz",
    reuseExistingServer: true,
    timeout: 180_000,
    env: {
      NODE_ENV: "production",
      // Local-only signing secret so the production bundle can mint demo
      // sessions (production fails closed without one). Never a real secret.
      BETTER_AUTH_SECRET: "e2e-local-only-insecure-secret",
    },
  },
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
