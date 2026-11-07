/**
 * Demo handoff constants — the deterministic demo tenant seeded by
 * packages/db/src/seed.ts (L02). The consent flow POSTs a real
 * CreateScanRequest against the seeded demo project; while the
 * workspace API lanes are still integrating, failures degrade to an
 * honest "handoff pending" state — never a fabricated result.
 */
export const DEMO_PROJECT_ID = "a0a0a0a0-0000-4000-8000-000000000002";
export const DEMO_WORKSPACE_SLUG = "highcastle-demo";
export const DEMO_PROJECT_SLUG = "invoice-auth-demo";
export const DEMO_SCANS_ENDPOINT = `/api/v1/projects/${DEMO_PROJECT_ID}/scans`;

/** Mirrors CreateScanRequestSchema (packages/contracts/src/scans.ts). */
export function demoScanRequest(idempotencyKey: string) {
  return {
    scanType: "targeted_red_team",
    testPackIds: ["bola-invoice-v1"],
    idempotencyKey,
  } as const;
}
