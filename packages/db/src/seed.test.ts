import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./test-utils.js";
import { DEMO, DEMO_IDS, seedDemo } from "./seed.js";
import { getEnvironment, getTarget, listTestIdentities } from "./repos/projects.js";
import { getScope, verifyScopeHash, toVerifiableScope } from "./repos/scopes.js";

/**
 * Deterministic demo seed.
 *
 * - First run creates the full demo graph with the documented fixed IDs.
 * - Second run is a no-op returning the same IDs and scope hash
 *   (repeatable seed for local dev and CI fixtures).
 * - Scope hash is a real canonical `scope-hash-v1` digest over the locked
 *   scope content and verifies through `verifyScopeHash`.
 */
describe("demo seed", () => {
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

  it("seeds the demo graph with fixed IDs", async () => {
    const result = await seedDemo(tdb.db);
    expect(result.workspaceId).toBe(DEMO_IDS.workspaceId);
    expect(result.projectId).toBe(DEMO_IDS.projectId);
    expect(result.vulnerableEnvId).toBe(DEMO_IDS.vulnerableEnvId);
    expect(result.patchedEnvId).toBe(DEMO_IDS.patchedEnvId);
    expect(result.targetId).toBe(DEMO_IDS.targetId);
    expect(result.scopeId).toBe(DEMO_IDS.scopeId);
    expect(result.scopeHash).toMatch(/^[0-9a-f]{64}$/);

    const identities = await listTestIdentities(tdb.db, result.workspaceId, result.vulnerableEnvId);
    expect(identities.map((i) => i.role).sort()).toEqual(["alice", "bob"]);
    expect(identities.every((i) => i.synthetic)).toBe(true);

    // L11 lab alignment: exact revisions, alias host, fixture version.
    expect(DEMO.vulnerableRevision).toBe("lab-v1-vulnerable");
    expect(DEMO.patchedRevision).toBe("lab-v2-patched");
    expect(DEMO.scopeHost).toBe("target-lab");
    expect(DEMO.targetOrigin).toBe("https://target-lab.internal");
    const vulnEnv = await getEnvironment(tdb.db, result.workspaceId, result.vulnerableEnvId);
    const patchedEnv = await getEnvironment(tdb.db, result.workspaceId, result.patchedEnvId);
    expect(vulnEnv?.currentRevision).toBe("lab-v1-vulnerable");
    expect(patchedEnv?.currentRevision).toBe("lab-v2-patched");
    const target = await getTarget(tdb.db, result.workspaceId, result.targetId);
    expect(target?.state).toBe("verified");
    expect(target?.canonicalOrigin).toBe("https://target-lab.internal");

    // The seeded scope hash verifies through the canonical verifier.
    const scope = await getScope(tdb.db, result.workspaceId, result.scopeId);
    expect(scope).not.toBeNull();
    expect(verifyScopeHash(toVerifiableScope(scope!))).toBe(true);
  });

  it("is idempotent: re-seeding returns identical rows, no duplicates", async () => {
    const first = await seedDemo(tdb.db);
    const second = await seedDemo(tdb.db);
    expect(second).toEqual(first);

    const identities = await listTestIdentities(tdb.db, first.workspaceId, first.vulnerableEnvId);
    expect(identities).toHaveLength(2);
  });
});
