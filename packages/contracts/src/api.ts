import { z } from "zod";
import { ApiErrorCodeSchema } from "./enums.js";
import {
  PageMetaSchema,
  RequestIdSchema,
} from "./common.js";

/**
 * Typed API envelopes (architecture/05_API_CONTRACTS).
 *
 * Success: `{ data: T, meta?: { requestId?, pagination? } }`.
 * Failure:  `{ error: { code, message, requestId, details? } }` — structured,
 * never leaking cross-tenant existence (unknown IDs read as 404 either way;
 * enforcement lives in L18, the shape here).
 */

// --- Success envelope ---

export function SuccessMetaSchema<T extends z.ZodTypeAny>(data: T) {
  return z
    .object({
      data,
      meta: z
        .object({
          requestId: RequestIdSchema.optional(),
          pagination: PageMetaSchema.optional(),
        })
        .strict()
        .optional(),
    })
    .strict();
}

export function ok<T>(data: T, requestId?: string) {
  return requestId === undefined
    ? { data }
    : { data, meta: { requestId } };
}

// --- Error envelope ---

export const ApiErrorSchema = z
  .object({
    error: z
      .object({
        code: ApiErrorCodeSchema,
        message: z.string().min(1).max(500),
        requestId: RequestIdSchema,
        details: z.record(z.unknown()).optional(),
      })
      .strict(),
  })
  .strict();
export type ApiError = z.infer<typeof ApiErrorSchema>;

export function fail(
  code: z.infer<typeof ApiErrorCodeSchema>,
  message: string,
  requestId: string,
  details?: Record<string, unknown>,
): ApiError {
  return {
    error: {
      code,
      message,
      requestId,
      ...(details === undefined ? {} : { details }),
    },
  };
}

/** Canonical HTTP status per error code (05_API_CONTRACTS). */
export const API_ERROR_HTTP_STATUS: Record<
  z.infer<typeof ApiErrorCodeSchema>,
  number
> = {
  validation_error: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  unprocessable: 422,
  rate_limited: 429,
  internal: 500,
  unavailable: 503,
  scope_denied: 403,
  policy_denied: 403,
  stale_revision: 409,
  quota_exceeded: 429,
  idempotency_conflict: 409,
};

/** Safe details never carry secrets, tokens, cookies, or raw model text. */
export const SafeErrorDetailsSchema = z.record(
  z.union([z.string(), z.number(), z.boolean()]),
);
export type SafeErrorDetails = z.infer<typeof SafeErrorDetailsSchema>;
