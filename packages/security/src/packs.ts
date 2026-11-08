import {
  TEST_PACK_MANIFEST,
  TestPackIdSchema,
  type AuthorizationScope,
  type TestPackId,
  type TestPackMethod,
} from "@highcastle/contracts";
import { denyReason, type PolicyDenyReason } from "./decisions.js";
import { deepFreeze } from "./freeze.js";

/**
 * Test-pack, method and demo target-alias enforcement.
 *
 * The model may only *name* an enumerated pack. This module decides whether
 * that named pack is additionally inside the approved scope, and which
 * methods the intersection of (pack manifest ∩ scope) permits. Unknown,
 * out-of-scope or method-mismatched selections deny — the model can narrow
 * the pre-approved surface, never widen it.
 */

export function getPackManifest(packId: TestPackId) {
  return TEST_PACK_MANIFEST[packId];
}

export function isKnownPackId(packId: string): packId is TestPackId {
  return TestPackIdSchema.safeParse(packId).success;
}

/** Methods the pack may actually use = manifest methods ∩ scope methods. */
export function resolvePermittedMethods(
  scope: Pick<AuthorizationScope, "allowedMethods">,
  packId: TestPackId,
): readonly TestPackMethod[] {
  const manifest = TEST_PACK_MANIFEST[packId];
  return deepFreeze(manifest.permittedMethods.filter((m) => scope.allowedMethods.includes(m)));
}

export function checkPackAuthorization(
  scope: Pick<AuthorizationScope, "allowedTestPackIds" | "allowedMethods">,
  packId: string,
): PolicyDenyReason[] {
  const reasons: PolicyDenyReason[] = [];

  if (!isKnownPackId(packId)) {
    reasons.push(
      denyReason("pack_unknown", `test pack ${JSON.stringify(packId)} is not enumerated`),
    );
    return reasons;
  }
  if (!scope.allowedTestPackIds.includes(packId)) {
    reasons.push(
      denyReason(
        "pack_not_permitted",
        `test pack ${JSON.stringify(packId)} is outside the approved scope`,
      ),
    );
  }
  if (resolvePermittedMethods(scope, packId).length === 0) {
    reasons.push(
      denyReason(
        "method_not_permitted",
        `no method required by ${packId} is permitted by the approved scope`,
      ),
    );
  }
  return reasons;
}

export function checkMethodPermitted(
  scope: Pick<AuthorizationScope, "allowedMethods">,
  packId: TestPackId,
  method: string,
): PolicyDenyReason[] {
  const reasons: PolicyDenyReason[] = [];
  const manifest = TEST_PACK_MANIFEST[packId];
  const inManifest = (manifest.permittedMethods as readonly string[]).includes(method);
  const inScope = (scope.allowedMethods as readonly string[]).includes(method);
  if (!inManifest || !inScope) {
    reasons.push(
      denyReason(
        "method_not_permitted",
        `method ${JSON.stringify(method)} is not permitted by pack manifest and scope`,
      ),
    );
  }
  return reasons;
}
