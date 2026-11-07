/**
 * Credential resolution — `CredentialRef` handle → synthetic lab token.
 *
 * For H the only resolvable refs are the two lab fixture identities from
 * apps/target-lab/src/fixtures.ts (L11): `lab-token-alice`, `lab-token-bob`.
 * They are valid ONLY against the synthetic lab and grant nothing on the
 * control plane, the model provider, or any third party.
 *
 * Unknown refs fail closed — the controller must never fabricate or
 * passthrough a caller-supplied token value.
 */

import type { CredentialResolver } from "./ports.ts";
import { CredentialResolutionError } from "./errors.ts";

/**
 * Published, H-scoped credential refs and their synthetic values.
 * Canonical refs follow L15's `credentialRefFor(role)` =
 * `ref:synthetic:alice|bob` (`packages/test-packs/src/fixtures.ts`).
 * `_session` aliases are kept for earlier integrations.
 */
export const SYNTHETIC_CREDENTIALS = {
  "ref:synthetic:alice": "lab-token-alice",
  "ref:synthetic:bob": "lab-token-bob",
  "ref:synthetic:alice_session": "lab-token-alice",
  "ref:synthetic:bob_session": "lab-token-bob",
} as const;

export type SyntheticCredentialRef = keyof typeof SYNTHETIC_CREDENTIALS;

export const CREDENTIAL_REFS = {
  alice: "ref:synthetic:alice",
  bob: "ref:synthetic:bob",
} as const;

export class StaticSyntheticCredentialResolver implements CredentialResolver {
  resolve(actorCredentialRef: string): Promise<string> {
    const value = (SYNTHETIC_CREDENTIALS as Record<string, string>)[actorCredentialRef];
    if (value === undefined) {
      return Promise.reject(new CredentialResolutionError(actorCredentialRef));
    }
    return Promise.resolve(value);
  }
}
