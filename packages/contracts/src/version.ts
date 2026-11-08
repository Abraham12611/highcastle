import { z } from "zod";

/**
 * Contract schema version.
 *
 * Every versioned wire object (model proposals, sandbox results, persisted
 * events) carries `schemaVersion: 1` while this package is at major version 0.
 * Bump the literal (and add a versioned union parser) only with coordinator
 * sign-off and an ADR entry — see README "Versioning".
 */
export const CONTRACT_SCHEMA_VERSION = 1 as const;

export const ContractSchemaVersionSchema = z.literal(CONTRACT_SCHEMA_VERSION);
export type ContractSchemaVersion = z.infer<typeof ContractSchemaVersionSchema>;

const SUPPORTED_CONTRACT_SCHEMA_VERSIONS = [
  CONTRACT_SCHEMA_VERSION,
] as const;

export function isSupportedContractSchemaVersion(
  value: unknown,
): value is ContractSchemaVersion {
  return (SUPPORTED_CONTRACT_SCHEMA_VERSIONS as readonly unknown[]).includes(
    value,
  );
}
