/**
 * bola-invoice-v1 pack manifest (L15).
 *
 * The manifest values are DERIVED from the canonical contract
 * (`TEST_PACK_MANIFEST` in `@highcastle/contracts`, lane L03) — never
 * restated by hand. If L03 bumps the pack version, this module follows it
 * and the manifest conformance test fails loudly until fixtures are
 * re-pinned. The oracle version is owned by this package (L15) and must
 * change whenever oracle classification logic changes.
 *
 * Budget/interface note for L04 (policy) and L14 (runner):
 * - `permittedMethods` covers pack TEST actions only (the invoice reads).
 *   Establishing Alice's synthetic session via `POST /api/auth/login` is a
 *   scoped setup prerequisite executed by the controller/runner before the
 *   pack's versioned steps; it is counted in `maxRequests` but is not a
 *   pack action method. The runner must still enforce the L04-approved
 *   scope: fixed lab alias, fixed known IDs, no enumeration.
 */

import {
  SANDBOX_HARD_CAPS,
  SCOPE_HARD_CAPS,
  TEST_PACK_MANIFEST,
  type TestPackId,
} from "@highcastle/contracts";

/** Canonical pack identifier (L03 `TestPackId` enum member). */
export const BOLA_PACK_ID = "bola-invoice-v1" satisfies TestPackId;

/** Versioned pack manifest, verbatim from the frozen contract. */
export const BOLA_PACK_MANIFEST = TEST_PACK_MANIFEST[BOLA_PACK_ID];

/** Pack version pinned for this implementation (mirrors the contract). */
export const BOLA_PACK_VERSION = BOLA_PACK_MANIFEST.version;

/**
 * Independent oracle version. Bump on ANY change to classification logic in
 * `oracle.ts`; recorded on every verdict so replays stay comparable.
 */
export const BOLA_ORACLE_VERSION = "bola-oracle-v1" as const;

/** Pack test-action methods: invoice reads are GET-only. */
export const BOLA_PERMITTED_METHODS = BOLA_PACK_MANIFEST.permittedMethods;

/** Hard request budget for one pack execution (setup login included). */
export const BOLA_MAX_REQUESTS = BOLA_PACK_MANIFEST.maxRequests;

/** Hard wall-clock budget for one pack execution, in seconds. */
export const BOLA_MAX_DURATION_SECONDS = BOLA_PACK_MANIFEST.maxDurationSeconds;

/**
 * Ordered versioned step identifiers executed by the runner. The two
 * `/api/auth/*` steps are setup prerequisites (session + identity check);
 * P1/S1 are the pack's graded assertions and the only steps that may use a
 * `permittedMethods` verb against invoice objects.
 */
export const BOLA_STEP_IDS = [
  "P0-health",
  "P0-ready",
  "P0-meta",
  "setup-login",
  "setup-whoami",
  "P1-own-invoice",
  "S1-cross-invoice",
] as const;

export type BolaStepId = (typeof BOLA_STEP_IDS)[number];

/**
 * Structural validation of the pack manifest against the safety invariants
 * the issue card requires: non-mutating, GET-only actions, bounded
 * requests/duration inside both the sandbox hard caps (L14) and the scope
 * hard caps (L04). Throws on violation; exercised by `manifest.test.ts`.
 */
export function assertBolaManifestInvariants(): void {
  const manifest = BOLA_PACK_MANIFEST;
  const failures: string[] = [];
  if (manifest.targetKind !== "owned_demo_lab") {
    failures.push(`targetKind must be owned_demo_lab, got ${manifest.targetKind}`);
  }
  if (manifest.mutating !== false) {
    failures.push("pack must be non-mutating");
  }
  if (manifest.permittedMethods.length !== 1 || manifest.permittedMethods[0] !== "GET") {
    failures.push(`pack test actions must be GET-only, got ${manifest.permittedMethods.join(",")}`);
  }
  if (manifest.maxRequests < BOLA_STEP_IDS.length) {
    failures.push(
      `maxRequests ${manifest.maxRequests} cannot cover ${BOLA_STEP_IDS.length} versioned steps`,
    );
  }
  if (manifest.maxRequests > SANDBOX_HARD_CAPS.maxRequests) {
    failures.push(
      `maxRequests ${manifest.maxRequests} exceeds sandbox hard cap ${SANDBOX_HARD_CAPS.maxRequests}`,
    );
  }
  if (manifest.maxRequests > SCOPE_HARD_CAPS.maxRequests) {
    failures.push(
      `maxRequests ${manifest.maxRequests} exceeds scope hard cap ${SCOPE_HARD_CAPS.maxRequests}`,
    );
  }
  if (manifest.maxDurationSeconds > SANDBOX_HARD_CAPS.maxDurationSeconds) {
    failures.push(
      `maxDurationSeconds ${manifest.maxDurationSeconds} exceeds sandbox hard cap ${SANDBOX_HARD_CAPS.maxDurationSeconds}`,
    );
  }
  if (manifest.maxDurationSeconds > SCOPE_HARD_CAPS.maxDurationSeconds) {
    failures.push(
      `maxDurationSeconds ${manifest.maxDurationSeconds} exceeds scope hard cap ${SCOPE_HARD_CAPS.maxDurationSeconds}`,
    );
  }
  if (BOLA_ORACLE_VERSION !== manifest.oracleVersion) {
    failures.push(
      `oracle version ${BOLA_ORACLE_VERSION} drifts from contract ${manifest.oracleVersion}`,
    );
  }
  if (failures.length > 0) {
    throw new Error(`bola-invoice-v1 manifest invariants violated: ${failures.join("; ")}`);
  }
}
