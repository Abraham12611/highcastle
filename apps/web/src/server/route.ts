import { DbError } from "@highcastle/db";
import { DatabaseUnavailable, getRequestDb } from "./db";
import type { BffDeps } from "./deps";
import {
  assertSameOrigin,
  clientIp,
  dbErrorResponse,
  errorResponse,
  newRequestId,
} from "./http";
import { QueueUnavailable, queueFromEnv } from "./queue";
import { RateLimiter } from "./rate-limit";
import { resolveSession } from "./session";
import type { RouteResult } from "./scans";

/**
 * Route wrapper: request ID, rate limit, CSRF check for mutations, session,
 * database, queue — then the flow. Every failure mode maps to the contract
 * error envelope; no stack trace or cross-tenant existence ever leaks.
 */

const limiters = new Map<string, RateLimiter>();

function limiterFor(route: string, method: string): RateLimiter {
  const key = `${method} ${route}`;
  let limiter = limiters.get(key);
  if (!limiter) {
    limiter = new RateLimiter(method === "POST" ? 30 : 120);
    limiters.set(key, limiter);
  }
  return limiter;
}

export interface RouteArgs {
  params: Record<string, string | undefined>;
  searchParams: URLSearchParams;
}

export async function handle(
  request: Request,
  route: string,
  params: Record<string, string | undefined>,
  fn: (args: {
    deps: BffDeps;
    params: Record<string, string | undefined>;
    searchParams: URLSearchParams;
    requestId: string;
    idempotencyKey: string | null;
  }) => Promise<RouteResult>,
): Promise<Response> {
  const requestId = newRequestId();
  try {
    if (!limiterFor(route, request.method).allow(`${clientIp(request)}:${route}`)) {
      return errorResponse("rate_limited", "rate limit exceeded", requestId);
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      if (!assertSameOrigin(request)) {
        return errorResponse("forbidden", "cross-origin mutation denied", requestId);
      }
    }
    const session = await resolveSession();
    const db = await getRequestDb();
    const deps: BffDeps = {
      db,
      queue: queueFromEnv(),
      session,
      now: new Date(),
    };
    const url = new URL(request.url);
    const result = await fn({
      deps,
      params: {},
      searchParams: url.searchParams,
      requestId,
      idempotencyKey: request.headers.get("idempotency-key"),
    });
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof QueueUnavailable) {
      return errorResponse("unavailable", error.message, requestId);
    }
    if (error instanceof DatabaseUnavailable) {
      return errorResponse("unavailable", error.message, requestId);
    }
    if (error instanceof DbError) {
      return dbErrorResponse(error, requestId);
    }
    return errorResponse("internal", "internal error", requestId);
  }
}
