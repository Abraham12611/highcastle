/** Shared live-mode gate: full-pipeline tests run only against the deployed containerized backend. */
export const LIVE_BASE = (process.env.HC_E2E_BASE_URL ?? "").replace(/\/$/, "") || null;
export const LIVE = process.env.HC_E2E_LIVE === "1" && LIVE_BASE !== null;
