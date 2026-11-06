import { z } from "zod";

/**
 * Shared scalar contracts: time, hashes, summaries, pagination.
 * UTC ISO-8601 on the wire; presentation timezone is a UI concern.
 */

/** UTC ISO-8601 datetime (`2026-11-06T15:00:00Z` or with offset). */
export const IsoUtcDateTimeSchema = z.string().datetime({ offset: true });
export type IsoUtcDateTime = z.infer<typeof IsoUtcDateTimeSchema>;

/** Lowercase hex SHA-256 digest (scope hashes, artifact digests). */
export const Sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/);
export type Sha256Hex = z.infer<typeof Sha256HexSchema>;

/** `scopeHash` / `policyHash` attached to every attempt and event. */
export const ScopeHashSchema = Sha256HexSchema;
export type ScopeHash = z.infer<typeof ScopeHashSchema>;

/** Strict `MAJOR.MINOR.PATCH` for pack / oracle / fixture versions. */
export const SemVerSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
export type SemVer = z.infer<typeof SemVerSchema>;

/**
 * UI-safe one-line event/proof summary. Bounded and plaintext by contract;
 * producers must redact before constructing it (never raw stdout/HTML).
 */
export const SafeSummarySchema = z.string().min(1).max(280);
export type SafeSummary = z.infer<typeof SafeSummarySchema>;

/** Opaque per-attempt nonce echoed by the runner to match results. */
export const AttemptNonceSchema = z.string().regex(/^[0-9a-f]{32,128}$/);
export type AttemptNonce = z.infer<typeof AttemptNonceSchema>;

/** `Idempotency-Key` header value for job-creating mutations. */
export const IdempotencyKeySchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9:_-]+$/);
export type IdempotencyKey = z.infer<typeof IdempotencyKeySchema>;

/** URL-safe project slug (`unique(workspace_id, slug)` in L02). */
export const ProjectSlugSchema = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/);
export type ProjectSlug = z.infer<typeof ProjectSlugSchema>;

/** Cursor pagination query shared by list endpoints. */
export const CursorPaginationQuerySchema = z
  .object({
    cursor: z.string().min(1).max(256).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export type CursorPaginationQuery = z.infer<typeof CursorPaginationQuerySchema>;

export const PageMetaSchema = z
  .object({
    nextCursor: z.string().min(1).max(256).optional(),
    limit: z.number().int().min(1).max(100),
  })
  .strict();
export type PageMeta = z.infer<typeof PageMetaSchema>;

/** Short request correlation ID echoed in every API error envelope. */
export const RequestIdSchema = z.string().min(1).max(64);
export type RequestId = z.infer<typeof RequestIdSchema>;
