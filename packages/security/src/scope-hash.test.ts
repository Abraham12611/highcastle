import { describe, expect, it } from "vitest";
import {
  canonicalizeScope,
  computeScopeHash,
  stableStringify,
  verifyScopeHash,
} from "./scope-hash.js";
import { makeDemoScope } from "./testing.js";

const HEX64 = /^[0-9a-f]{64}$/;

describe("computeScopeHash", () => {
  it("produces a stable lowercase hex SHA-256", () => {
    const scope = makeDemoScope();
    const hash = computeScopeHash(scope);
    expect(hash).toMatch(HEX64);
    expect(computeScopeHash(scope)).toBe(hash);
    // and the stored hash equals a fresh computation
    expect(scope.scopeHash).toBe(hash);
  });

  it("is independent of object key insertion order", () => {
    const scope = makeDemoScope();
    const reordered = Object.fromEntries(Object.entries(scope).reverse()) as typeof scope;
    expect(computeScopeHash(reordered)).toBe(computeScopeHash(scope));
  });

  it("is independent of allowed-list ordering and duplicates", () => {
    const a = makeDemoScope({ allowedHosts: ["b.example.com", "a.example.com"] });
    const b = makeDemoScope({
      allowedHosts: ["A.EXAMPLE.COM", "b.example.com", "b.example.com"],
    });
    expect(computeScopeHash(a)).toBe(computeScopeHash(b));
  });

  it("changes when any authority-bearing field changes", () => {
    const base = makeDemoScope();
    const variants: Array<Partial<typeof base>> = [
      { maxRequests: 17 },
      { allowedHosts: ["other-lab"] },
      { allowedPaths: ["/api/invoices", "/api/admin"] },
      { deniedPaths: ["/api/other-denied"] },
      { expiresAt: "2026-11-06T14:00:00.000Z" },
      { version: 2 },
    ];
    for (const v of variants) {
      const mutated = { ...base, ...v };
      expect(computeScopeHash(mutated)).not.toBe(base.scopeHash);
    }
  });

  it("does NOT change on status transitions (lifecycle, not authority)", () => {
    const scope = makeDemoScope();
    const revoked = { ...scope, status: "revoked" as const };
    expect(computeScopeHash(revoked)).toBe(scope.scopeHash);
  });
});

describe("verifyScopeHash", () => {
  it("accepts an untampered scope", () => {
    expect(verifyScopeHash(makeDemoScope())).toBe(true);
  });

  it("rejects a scope whose content was mutated post-approval", () => {
    const scope = makeDemoScope();
    const widened = { ...scope, maxRequests: scope.maxRequests * 10 };
    expect(verifyScopeHash(widened)).toBe(false);
  });

  it("rejects a malformed stored hash (fail closed)", () => {
    const scope = makeDemoScope();
    expect(verifyScopeHash({ ...scope, scopeHash: "not-a-hash" })).toBe(false);
    expect(verifyScopeHash({ ...scope, scopeHash: "" })).toBe(false);
  });
});

describe("stableStringify", () => {
  it("sorts object keys recursively", () => {
    expect(stableStringify({ b: { d: 1, c: 2 }, a: [3, { z: 0, y: 1 }] })).toBe(
      '{"a":[3,{"y":1,"z":0}],"b":{"c":2,"d":1}}',
    );
  });
});

describe("canonicalizeScope", () => {
  it("excludes status and scopeHash", () => {
    const canonical = canonicalizeScope(makeDemoScope());
    expect(canonical).not.toHaveProperty("status");
    expect(canonical).not.toHaveProperty("scopeHash");
  });
});
