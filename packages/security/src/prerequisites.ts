import type { TestPackId } from "@highcastle/contracts";
import {
  SetupOperationSchema,
  denyReason,
  type PolicyDenyReason,
  type SetupOperation,
} from "./decisions.js";
import { deepFreeze } from "./freeze.js";

/**
 * Explicit, separately-scoped runner prerequisites.
 *
 * Test packs declare a GET-only *test action* surface
 * (`TEST_PACK_MANIFEST.permittedMethods` ∩ `scope.allowedMethods`). The
 * owned lab additionally requires a small, FIXED set of setup/read
 * operations — session creation (`POST /api/auth/login`), session check,
 * teardown, health/readiness/meta — that are NOT test actions and must not
 * be granted by widening `allowedMethods` or `allowedPaths`.
 *
 * These operations are scoped by construction:
 * - They are declared per-pack, here in policy code (never by the model,
 *   the scope, or a redirect), as exact method+path pairs.
 * - They apply only to the `target-lab` service alias — the runner cannot
 *   turn a prerequisite into a request to any other destination.
 * - A scope `deniedPaths` entry still blocks a prerequisite (deny wins);
 *   prerequisites bypass `allowedPaths` only because they are already
 *   narrower than any reasonable path prefix.
 */

/**
 * Per-pack fixed prerequisite declaration, mirroring the actual target-lab
 * route table (`apps/target-lab/src/app.ts`). Adding an entry here is a
 * policy change — coordinator sign-off required.
 */
export const PACK_PREREQUISITES: Readonly<Record<TestPackId, readonly SetupOperation[]>> =
  deepFreeze({
    "bola-invoice-v1": [
      // Session setup/teardown — the ONLY POSTs the runner may ever make.
      { method: "POST", path: "/api/auth/login" },
      { method: "POST", path: "/api/auth/logout" },
      // Session sanity read.
      { method: "GET", path: "/api/auth/whoami" },
      // Environment readiness reads (preflight, not test actions).
      { method: "GET", path: "/health" },
      { method: "GET", path: "/ready" },
      { method: "GET", path: "/api/meta" },
    ],
  });

export function resolveSetupOperations(packId: TestPackId): readonly SetupOperation[] {
  return PACK_PREREQUISITES[packId];
}

/** Normalize a prerequisite path (query/fragment stripped, decoded once). */
export function normalizeSetupPath(raw: string): string | null {
  if (raw.length === 0 || raw.length > 128) return null;
  const path = raw.split(/[?#]/, 1)[0] ?? "";
  if (!path.startsWith("/")) return null;
  try {
    return decodeURIComponent(path);
  } catch {
    return null;
  }
}

export function isSetupOperation(packId: TestPackId, method: string, path: string): boolean {
  const normalized = normalizeSetupPath(path);
  if (normalized === null) return false;
  return PACK_PREREQUISITES[packId].some((op) => op.method === method && op.path === normalized);
}

const SetupMethodSchema = SetupOperationSchema.shape.method;

/**
 * Gate a single prerequisite call for `purpose: "setup"` requests.
 * Denies unless (method, path) is an exact declared prerequisite for the
 * pack — and additionally honors the scope's `deniedPaths` (deny always
 * wins, even for prerequisites).
 */
export function checkSetupOperationPermitted(
  packId: TestPackId,
  scopeDeniedPaths: readonly string[],
  method: unknown,
  path: unknown,
): PolicyDenyReason[] {
  const reasons: PolicyDenyReason[] = [];

  const parsedMethod = SetupMethodSchema.safeParse(method);
  if (!parsedMethod.success) {
    reasons.push(
      denyReason(
        "setup_op_not_permitted",
        `setup method ${JSON.stringify(method)} is not a permitted prerequisite verb`,
      ),
    );
    return reasons;
  }
  if (typeof path !== "string" || path.length === 0) {
    reasons.push(denyReason("setup_op_not_permitted", "setup path is malformed"));
    return reasons;
  }

  if (!isSetupOperation(packId, parsedMethod.data, path)) {
    reasons.push(
      denyReason(
        "setup_op_not_permitted",
        `${parsedMethod.data} ${JSON.stringify(path)} is not a declared prerequisite for pack ${packId}`,
      ),
    );
    return reasons;
  }

  // Scope deniedPaths still wins over prerequisites — fail closed.
  const normalized = normalizeSetupPath(path);
  for (const entry of scopeDeniedPaths) {
    const e = entry.split(/[?#]/, 1)[0] ?? "";
    if (
      normalized !== null &&
      e !== "" &&
      (normalized === e || normalized.startsWith(`${e}/`) || e === "/")
    ) {
      reasons.push(
        denyReason(
          "path_explicitly_denied",
          `prerequisite path is under denied scope prefix ${JSON.stringify(entry)}`,
        ),
      );
      return reasons;
    }
  }

  return reasons;
}
