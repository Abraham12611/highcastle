import {
  API_ERROR_HTTP_STATUS,
  fail,
  type ApiErrorCode,
} from "@highcastle/contracts";
import { DbError } from "@highcastle/db";

/**
 * HTTP plumbing for the BFF: request IDs, contract envelopes, error mapping,
 * CSRF origin checks, and pagination parsing. Route handlers stay thin;
 * everything here is unit-tested without a Next server.
 */

export function newRequestId(): string {
  return crypto.randomUUID();
}

export function okResponse(data: unknown, status = 200, requestId?: string) {
  const body =
    requestId === undefined ? { data } : { data, meta: { requestId } };
  return Response.json(body, { status });
}

type ErrorCode = ApiErrorCode | "unauthorized";

const HTTP_STATUS: Record<ErrorCode, number> = {
  ...API_ERROR_HTTP_STATUS,
  unauthorized: 401,
};

export function errorResponse(
  code: ErrorCode,
  message: string,
  requestId: string,
  details?: Record<string, string | number | boolean>,
  statusOverride?: number,
) {
  const status = statusOverride ?? HTTP_STATUS[code];
  return Response.json(fail(code, message, requestId, details), { status });
}

/** Map storage errors to HTTP without re-interpreting them. `DbError` codes
 * already follow the contract taxonomy; unknown failures become 500. */
export function dbErrorResponse(error: unknown, requestId: string): Response {
  if (error instanceof DbError) {
    return errorResponse(error.code, error.message, requestId, error.details);
  }
  return errorResponse("internal", "internal error", requestId);
}

/** POST mutations require same-origin when the client sends Origin/Referer.
 * Cookie-less API clients (curl, tests) omit both and pass; forged
 * cross-origin browser requests are rejected. */
export function assertSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = request.headers.get("host");
  const candidate = origin ?? referer;
  if (!candidate || !host) return true;
  try {
    return new URL(candidate).host === host;
  } catch {
    return false;
  }
}

export interface Pagination {
  limit: number;
  cursor?: string;
}

export function parsePagination(
  searchParams: URLSearchParams,
  maxLimit = 100,
): Pagination {
  const rawLimit = searchParams.get("limit");
  const limit =
    rawLimit === null ? 20 : Number.parseInt(rawLimit, 10);
  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
    throw new Error("invalid limit");
  }
  const cursor = searchParams.get("cursor") ?? undefined;
  return { limit, ...(cursor === undefined ? {} : { cursor }) };
}

/** UUID path params: malformed IDs are 400, never a store lookup. */
export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export function parseUuid(value: string): string | null {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  )
    ? value
    : null;
}
