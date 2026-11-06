/**
 * Reference `SandboxPolicyGate` for the H boundary.
 *
 * L04 owns the real deterministic policy engine (scope intersection, expiry,
 * revocation, approval). It does not exist yet; this gate enforces everything
 * decidable *locally* from the frozen contracts and fails closed on the rest.
 * When L04 lands, it implements the same `SandboxPolicyGate` interface and
 * the controller gains full scope verification with zero call-site changes.
 *
 * Local (decidable here) checks:
 * - packId is the enumerated H pack and packVersion matches the manifest
 * - permittedMethods ⊆ manifest methods (GET only)
 * - limits are inside min(manifest budget, SANDBOX_HARD_CAPS)
 * - targetServiceAlias is the lab alias (schema already enforces this;
 *   rechecked as defense in depth)
 * - targetImageDigest / policyHash / nonce are present and well-formed
 *
 * NOT decidable locally (documented, delegated to L04): scope-hash lookup
 * against a revoked/expired scope, per-workspace quota, approval freshness.
 */

import { SANDBOX_HARD_CAPS, TEST_PACK_MANIFEST, type SandboxRequest } from "@highcastle/contracts";

import type { PolicyDecision, SandboxPolicyGate } from "./ports.ts";

export const LOCAL_POLICY_VERSION = "l14-local-v1";

export class StaticLabPolicyGate implements SandboxPolicyGate {
  authorize(request: SandboxRequest): Promise<PolicyDecision> {
    const deny = (reason: string): PolicyDecision => ({
      allowed: false,
      policyVersion: LOCAL_POLICY_VERSION,
      reason,
    });

    const manifest = TEST_PACK_MANIFEST[request.packId];
    if (manifest === undefined) {
      return Promise.resolve(deny(`pack ${request.packId} is not an enumerated H pack`));
    }
    if (request.packVersion !== manifest.version) {
      return Promise.resolve(
        deny(`packVersion ${request.packVersion} != manifest ${manifest.version}`),
      );
    }
    if (request.targetServiceAlias !== "target-lab") {
      return Promise.resolve(deny(`target alias ${request.targetServiceAlias} is not allowed`));
    }

    const allowedMethods = new Set<string>(manifest.permittedMethods);
    for (const method of request.permittedMethods) {
      if (!allowedMethods.has(method)) {
        return Promise.resolve(deny(`method ${method} is outside the pack manifest`));
      }
    }

    const { limits } = request;
    if (limits.maxRequests > Math.min(manifest.maxRequests, SANDBOX_HARD_CAPS.maxRequests)) {
      return Promise.resolve(
        deny(`maxRequests ${limits.maxRequests} exceeds pack budget ${manifest.maxRequests}`),
      );
    }
    if (
      limits.maxDurationSeconds >
      Math.min(manifest.maxDurationSeconds, SANDBOX_HARD_CAPS.maxDurationSeconds)
    ) {
      return Promise.resolve(
        deny(
          `maxDurationSeconds ${limits.maxDurationSeconds} exceeds pack budget ${manifest.maxDurationSeconds}`,
        ),
      );
    }
    if (limits.maxMemoryMb > SANDBOX_HARD_CAPS.maxMemoryMb) {
      return Promise.resolve(deny(`maxMemoryMb ${limits.maxMemoryMb} exceeds hard cap`));
    }
    if (limits.maxCpuMillicores > SANDBOX_HARD_CAPS.maxCpuMillicores) {
      return Promise.resolve(deny(`maxCpuMillicores ${limits.maxCpuMillicores} exceeds hard cap`));
    }
    if (limits.maxPids > SANDBOX_HARD_CAPS.maxPids) {
      return Promise.resolve(deny(`maxPids ${limits.maxPids} exceeds hard cap`));
    }

    if (request.targetImageDigest.trim().length === 0) {
      return Promise.resolve(deny("targetImageDigest is required"));
    }

    return Promise.resolve({ allowed: true, policyVersion: LOCAL_POLICY_VERSION });
  }
}
