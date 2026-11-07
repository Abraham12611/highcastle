# HighCastle browser E2E (F4 lane)

Real Chromium (`chrome-headless-shell`) against the real UI. No mocks, no
fixture data presented as live execution.

## Run

From `apps/web`:

```sh
pnpm exec playwright test -c e2e/playwright.config.ts --project=desktop
pnpm exec playwright test -c e2e/playwright.config.ts --project=mobile
```

Uses `~/.cache/ms-playwright/chromium_headless_shell-1254/...` via
`HC_CHROME` (override with `HC_CHROME=/path/to/chrome`). Build once with
`pnpm build`, then the production server on `:3119` starts automatically
(`reuseExistingServer: true`).

## What runs by default

Everything that works **without** a database, orchestrator, or Vultr
credentials: landing → demo consent → guest session → honest failure states
for scans/findings, negative session/scope/backend cases, and structural
a11y checks.

## Live pipeline (gated, E3 coordination)

`journey-live.spec.ts` runs only with both variables set, and the local
web server is disabled in that mode — all traffic goes to the deployment:

```sh
HC_E2E_LIVE=1 HC_E2E_BASE_URL=https://<preview-or-staging> \
  pnpm exec playwright test -c e2e/playwright.config.ts -g "full pipeline"
```

`HC_E2E_LIVE=1` without `HC_E2E_BASE_URL` fails fast. A skip is reported as
a skip, never as a pass. Final scan/replay cases must run against the
deployed pipeline, not mocked backend results. Current preview (E3):
`https://45.77.204.195.sslip.io/` (L19 record, PR #56).

## Artifacts

- `e2e/screenshots/` — committed screenshots of real UI states.
- `e2e/test-results/`, `e2e/report/` — local run output, git-ignored.
