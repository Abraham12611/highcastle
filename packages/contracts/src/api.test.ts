import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  API_ERROR_HTTP_STATUS,
  ApiErrorSchema,
  SuccessMetaSchema,
  fail,
  ok,
} from "./api.js";
import { ApiErrorCodeSchema } from "./enums.js";

describe("API envelopes", () => {
  it("wraps data with an optional requestId", () => {
    const schema = SuccessMetaSchema(z.object({ scanId: z.string() }));
    expect(schema.parse(ok({ scanId: "s1" }, "req-1"))).toEqual({
      data: { scanId: "s1" },
      meta: { requestId: "req-1" },
    });
    expect(schema.parse(ok({ scanId: "s1" }))).toEqual({
      data: { scanId: "s1" },
    });
  });

  it("builds a structured error with requestId", () => {
    const err = fail("policy_denied", "Out-of-scope pack", "req-9", {
      packId: "nmap-full",
    });
    expect(ApiErrorSchema.parse(err).error.code).toBe("policy_denied");
  });

  it("accepts flat safe details", () => {
    const parsed = ApiErrorSchema.parse(
      fail("quota_exceeded", "Too many scans", "req-2", {
        packId: "bola-invoice-v1",
        limit: 8,
        retried: false,
      }),
    );
    expect(parsed.error.details).toEqual({
      packId: "bola-invoice-v1",
      limit: 8,
      retried: false,
    });
  });

  it("rejects nested objects and arrays in error details", () => {
    const base = {
      error: {
        code: "internal",
        message: "boom",
        requestId: "req-3",
        details: { nested: { secret: "x" } },
      },
    };
    expect(() => ApiErrorSchema.parse(base)).toThrow();
    expect(() =>
      ApiErrorSchema.parse({
        ...base,
        error: { ...base.error, details: { list: ["a", "b"] } },
      }),
    ).toThrow();
  });

  it("maps every error code to its documented HTTP status", () => {
    const codes = ApiErrorCodeSchema.options;
    expect(Object.keys(API_ERROR_HTTP_STATUS).sort()).toEqual([...codes].sort());
    expect(API_ERROR_HTTP_STATUS.validation_error).toBe(400);
    expect(API_ERROR_HTTP_STATUS.unauthorized).toBe(401);
    expect(API_ERROR_HTTP_STATUS.scope_denied).toBe(403);
    expect(API_ERROR_HTTP_STATUS.policy_denied).toBe(403);
    expect(API_ERROR_HTTP_STATUS.idempotency_conflict).toBe(409);
    expect(API_ERROR_HTTP_STATUS.quota_exceeded).toBe(429);
    expect(API_ERROR_HTTP_STATUS.unavailable).toBe(503);
  });
});
