import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPERATOR_CAPS,
  checkRequestedBudget,
  intersectExecutionBudget,
} from "./budgets.js";
import { checkPathPermitted, normalizeScopedPath, pathMatchesScopeEntry } from "./paths.js";
import { makeDemoScope } from "./testing.js";

describe("intersectExecutionBudget", () => {
  it("takes the component-wise minimum of operator ∩ scope ∩ pack", () => {
    const scope = makeDemoScope({
      maxDurationSeconds: 300,
      maxRequests: 50,
      maxConcurrency: 4,
      maxMemoryMb: 1024,
    });
    const limits = intersectExecutionBudget(scope, DEFAULT_OPERATOR_CAPS, "bola-invoice-v1");
    // pack: 8 req / 30 s — beats scope and operator on both
    expect(limits.maxRequests).toBe(8);
    expect(limits.maxDurationSeconds).toBe(30);
    // scope wins where it is tighter than operator+pack
    expect(limits.maxMemoryMb).toBe(512); // operator cap 512 < scope 1024
    expect(limits.maxConcurrency).toBe(1); // operator 1 < scope 4
    expect(limits.maxCpuMillicores).toBe(1000);
    expect(limits.maxPids).toBe(64);
  });

  it("lets a narrower scope narrow the pack further (never widen)", () => {
    const scope = makeDemoScope({ maxRequests: 2, maxDurationSeconds: 10 });
    const limits = intersectExecutionBudget(scope, DEFAULT_OPERATOR_CAPS, "bola-invoice-v1");
    expect(limits.maxRequests).toBe(2);
    expect(limits.maxDurationSeconds).toBe(10);
  });

  it("returns an immutable object", () => {
    const limits = intersectExecutionBudget(
      makeDemoScope(),
      DEFAULT_OPERATOR_CAPS,
      "bola-invoice-v1",
    );
    expect(Object.isFrozen(limits)).toBe(true);
  });
});

describe("checkRequestedBudget", () => {
  const effective = intersectExecutionBudget(
    makeDemoScope(),
    DEFAULT_OPERATOR_CAPS,
    "bola-invoice-v1",
  );

  it("passes budgets at or below the effective limit", () => {
    expect(checkRequestedBudget({ maxRequests: 4 }, effective)).toHaveLength(0);
  });

  it("denies any field exceeding the effective intersection", () => {
    const reasons = checkRequestedBudget({ maxRequests: 99, maxDurationSeconds: 500 }, effective);
    expect(reasons.map((r) => r.code)).toEqual(["budget_exceeded", "budget_exceeded"]);
  });

  it("denies non-integer or non-positive budgets", () => {
    const reasons = checkRequestedBudget({ maxRequests: 0, maxMemoryMb: 1.5 }, effective);
    expect(reasons.length).toBe(2);
  });
});

describe("normalizeScopedPath", () => {
  it("normalizes canonical paths", () => {
    expect(normalizeScopedPath("/api/invoices/inv_A")).toBe("/api/invoices/inv_A");
    expect(normalizeScopedPath("/api/invoices/")).toBe("/api/invoices");
    expect(normalizeScopedPath("/")).toBe("/");
    expect(normalizeScopedPath("/api//invoices")).toBe("/api/invoices");
  });

  it("strips query and fragment before matching", () => {
    expect(normalizeScopedPath("/api/invoices?token=abc#x")).toBe("/api/invoices");
  });

  it("decodes percent-encoding, including double-encoded traversal", () => {
    expect(normalizeScopedPath("/api/%69nvoices")).toBe("/api/invoices");
    expect(normalizeScopedPath("/api/%2e%2e/x")).toBeNull();
    expect(normalizeScopedPath("/api/%252e%252e/x")).toBeNull();
  });

  it("rejects traversal, backslashes, non-absolute and malformed input", () => {
    for (const p of [
      "/api/../x",
      "/api/./../x",
      "api/invoices",
      "",
      "/api/\\admin",
      "/api/%zz",
      "http://evil.com/x",
    ]) {
      expect(normalizeScopedPath(p), p).toBeNull();
    }
  });
});

describe("pathMatchesScopeEntry", () => {
  it("matches exact and prefix-boundary paths", () => {
    expect(pathMatchesScopeEntry("/api/invoices", "/api/invoices")).toBe(true);
    expect(pathMatchesScopeEntry("/api/invoices/1", "/api/invoices")).toBe(true);
    expect(pathMatchesScopeEntry("/api/invoicesX", "/api/invoices")).toBe(false);
    expect(pathMatchesScopeEntry("/api", "/api/invoices")).toBe(false);
  });

  it("treats a root scope entry as covering all paths", () => {
    expect(pathMatchesScopeEntry("/anything/at/all", "/")).toBe(true);
  });
});

describe("checkPathPermitted", () => {
  const scope = {
    allowedPaths: ["/api/invoices"],
    deniedPaths: ["/api/invoices/admin"],
  };

  it("permits allowed prefixes and exact matches", () => {
    expect(checkPathPermitted(scope, "/api/invoices/inv_B").permitted).toBe(true);
    expect(checkPathPermitted(scope, "/api/invoices").permitted).toBe(true);
  });

  it("denied prefixes win over allowed prefixes", () => {
    const r = checkPathPermitted(scope, "/api/invoices/admin/x");
    expect(r.permitted).toBe(false);
    expect(r.reason?.code).toBe("path_explicitly_denied");
  });

  it("denies paths outside every allowed prefix", () => {
    const r = checkPathPermitted(scope, "/api/other");
    expect(r.permitted).toBe(false);
    expect(r.reason?.code).toBe("path_not_permitted");
  });

  it("fails closed on a malformed denied-scope entry", () => {
    const weird = { allowedPaths: ["/api"], deniedPaths: ["/../escape"] };
    const r = checkPathPermitted(weird, "/api/invoices");
    expect(r.permitted).toBe(false);
    expect(r.reason?.code).toBe("path_explicitly_denied");
  });
});
