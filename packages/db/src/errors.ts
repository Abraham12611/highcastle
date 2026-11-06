import type { ApiErrorCode } from "./api-codes.js";

/**
 * Storage-layer error with a contract-aligned code.
 *
 * Codes reuse the `@highcastle/contracts` API error taxonomy so L18 can map
 * them to HTTP responses without re-interpreting storage failures:
 * unknown IDs read as `not_found` either way (never leak cross-tenant
 * existence), duplicate idempotent writes as `idempotency_conflict`,
 * policy/scope violations as `scope_denied`, and concurrent-write races as
 * `conflict`.
 */
export class DbError extends Error {
  readonly code: ApiErrorCode;
  readonly details: Record<string, string | number | boolean> | undefined;

  constructor(
    code: ApiErrorCode,
    message: string,
    details?: Record<string, string | number | boolean>,
  ) {
    super(message);
    this.name = "DbError";
    this.code = code;
    this.details = details;
  }

  static notFound(entity: string, id: string): DbError {
    return new DbError("not_found", `${entity} not found`, { entity, id });
  }

  static conflict(message: string, details?: Record<string, string | number | boolean>): DbError {
    return new DbError("conflict", message, details);
  }

  static idempotencyConflict(message: string): DbError {
    return new DbError("idempotency_conflict", message);
  }
}
