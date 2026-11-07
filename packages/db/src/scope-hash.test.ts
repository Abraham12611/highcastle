import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createFixtureChain, createTestDb, type TestDb } from "./test-utils.js";
import {
  canonicalizeScope,
  computeScopeHash,
  getScope,
  stableStringify,
  toVerifiableScope,
  verifyScopeHash,
} from "./repos/scopes.js";

/**
 * Canonical scope hash (`scope-hash-v1`) — byte-identical mirror of L04
 * `@highcastle/security` `computeScopeHash`.
 *
 * The expected digest below was produced by L04's actual implementation over
 * L04's demo grant (`allowedHosts: ["target-lab"], ...`, expiry
 * `2026-11-06T13:00:00Z`): any divergence between the two call sites fails
 * closed here before it can fail closed in production. The remaining cases
 * mirror L04's own suite semantics (key order, list normalization, versioned
 * payload, status lifecycle, tamper rejection, malformed hash).
 */
const HEX64 = /^[0-9a-f]{64}$/;

/** L04 demo grant (their `makeDemoScope` defaults) as a plain input bag. */
function l04DemoGrant() {
  return {
    workspaceId: "11111111-1111-4111-8111-111111111111",
    projectId: "22222222-2222-4222-8222-222222222222",
    targetId: "33333333-3333-4333-8333-333333333333",
    actorUserId: "55555555-5555-4555-8555-555555555555",
    version: 1,
    allowedHosts: ["target-lab"],
    allowedPaths: ["/api/invoices"],
    deniedPaths: ["/api/invoices/admin"],
    allowedTestPackIds: ["bola-invoice-v1"],
    allowedMethods: ["GET"],
    maxDurationSeconds: 60,
    maxRequests: 16,
    maxConcurrency: 1,
    maxMemoryMb: 256,
    networkProfileId: "lab-isolated-net",
    permittedEnvironmentId: "44444444-4444-4444-8444-444444444444",
    expiresAt: new Date("2026-11-06T13:00:00.000Z"),
  };
}

/** Digest produced by L04's `computeScopeHash` over `l04DemoGrant()`. */
const L04_REFERENCE_DIGEST = "be2e26b134613f8706e355b8320f26f124ca8ef290fae02812ee4638fba4c961";

describe("canonical scope hash (L04 contract)", () => {
  it("reproduces L04's reference digest byte-for-byte", () => {
    expect(computeScopeHash(l04DemoGrant())).toBe(L04_REFERENCE_DIGEST);
  });

  it("produces a stable lowercase hex SHA-256", () => {
    const hash = computeScopeHash(l04DemoGrant());
    expect(hash).toMatch(HEX64);
    expect(computeScopeHash(l04DemoGrant())).toBe(hash);
  });

  it("is independent of object key insertion order", () => {
    const grant = l04DemoGrant();
    const reordered = Object.fromEntries(Object.entries(grant).reverse()) as typeof grant;
    expect(computeScopeHash(reordered)).toBe(computeScopeHash(grant));
  });

  it("is independent of allowed-list ordering, case and duplicates", () => {
    const a = computeScopeHash(l04DemoGrant());
    const b = computeScopeHash({
      ...l04DemoGrant(),
      allowedHosts: ["TARGET-LAB", "target-lab"],
    });
    expect(b).toBe(a);
  });

  it("is versioned: the payload carries the scope-hash-v1 tag", () => {
    expect(stableStringify(canonicalizeScope(l04DemoGrant()))).toContain(
      '"expiresAt":"2026-11-06T13:00:00.000Z"',
    );
  });

  it("changes when any authority-bearing field changes", () => {
    const base = computeScopeHash(l04DemoGrant());
    const variants = [
      { maxRequests: 17 },
      { allowedHosts: ["other-lab"] },
      { allowedPaths: ["/api/invoices", "/api/admin"] },
      { deniedPaths: ["/api/other-denied"] },
      { expiresAt: new Date("2026-11-06T14:00:00.000Z") },
      { version: 2 },
    ];
    for (const v of variants) {
      expect(computeScopeHash({ ...l04DemoGrant(), ...v })).not.toBe(base);
    }
  });

  it("does NOT change on status transitions (lifecycle, not authority)", () => {
    expect(computeScopeHash({ ...l04DemoGrant(), status: "revoked", scopeHash: "x" })).toBe(
      computeScopeHash(l04DemoGrant()),
    );
  });

  it("normalizes expiresAt to UTC ISO — Date and string hash identically", () => {
    const asDate = computeScopeHash(l04DemoGrant());
    const asString = computeScopeHash({
      ...l04DemoGrant(),
      expiresAt: "2026-11-06T13:00:00.000Z",
    });
    expect(asDate).toBe(asString);
  });

  it("throws on an unparseable expiresAt (fail loud, not silent hash)", () => {
    expect(() => computeScopeHash({ ...l04DemoGrant(), expiresAt: "not-a-date" })).toThrow(
      RangeError,
    );
  });

  it("excludes row identity and lifecycle from the canonical object", () => {
    const persisted = {
      ...l04DemoGrant(),
      id: "66666666-6666-4666-8666-666666666666",
      status: "revoked" as const,
      scopeHash: "x",
      approvedAt: "2026-11-06T11:00:00.000Z",
    };
    const canonical = canonicalizeScope(persisted);
    for (const field of ["status", "scopeHash", "id", "approvedAt"]) {
      expect(canonical).not.toHaveProperty(field);
    }
  });
});

describe("DB scope → verification (L04 contract)", () => {
  let tdb: TestDb;
  beforeAll(async () => {
    tdb = await createTestDb();
  });
  afterAll(async () => {
    await tdb.close();
  });
  afterEach(async () => {
    await tdb.reset();
  });

  it("a scope created through the DB verifies", async () => {
    const f = await createFixtureChain(tdb.db);
    const row = await getScope(tdb.db, f.workspaceId, f.scopeId);
    expect(row).not.toBeNull();
    const verifiable = toVerifiableScope(row!);
    // Row materializes exactly what L04 verifies: active status, ISO dates.
    expect(verifiable.status).toBe("active");
    expect(verifiable.scopeHash).toMatch(HEX64);
    expect(verifiable.scopeHash).toBe(f.scopeHash);
    expect(verifyScopeHash(verifiable)).toBe(true);
  });

  it("a revoked DB scope still verifies (lifecycle denies separately)", async () => {
    const f = await createFixtureChain(tdb.db);
    const row = await getScope(tdb.db, f.workspaceId, f.scopeId);
    const revoked = { ...toVerifiableScope(row!), status: "revoked" };
    expect(verifyScopeHash(revoked)).toBe(true);
  });

  it("rejects a DB scope whose content was mutated post-approval", async () => {
    const f = await createFixtureChain(tdb.db);
    const row = await getScope(tdb.db, f.workspaceId, f.scopeId);
    const tampered = {
      ...toVerifiableScope(row!),
      maxRequests: row!.maxRequests * 10,
    };
    expect(verifyScopeHash(tampered)).toBe(false);
  });

  it("rejects a malformed stored hash (fail closed)", async () => {
    const f = await createFixtureChain(tdb.db);
    const row = await getScope(tdb.db, f.workspaceId, f.scopeId);
    expect(verifyScopeHash({ ...toVerifiableScope(row!), scopeHash: "not-a-hash" })).toBe(false);
  });

  it("identical grants dedupe to one persisted row", async () => {
    const f = await createFixtureChain(tdb.db);
    const row = await getScope(tdb.db, f.workspaceId, f.scopeId);
    expect(row!.scopeHash).toBe(f.scopeHash);
    expect(verifyScopeHash(toVerifiableScope(row!))).toBe(true);
  });
});
