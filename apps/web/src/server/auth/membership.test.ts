import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWorkspace, getWorkspaceMember } from "@highcastle/db";
import { createTestDb, type TestDb } from "../db";
import { internalUserIdForClerk, listUserWorkspaces } from "./membership";
import { clerkConfigured } from "./clerk";
import { DEMO_WORKSPACE_ID } from "../../lib/auth/session-core";

let testDb: TestDb;
beforeAll(async () => {
  testDb = await createTestDb();
}, 60_000);
afterAll(async () => {
  await testDb.close();
});

describe("internalUserIdForClerk mapping", () => {
  it("is deterministic, UUIDv5-shaped and unique per subject", () => {
    const a = internalUserIdForClerk("user_abc");
    expect(a).toBe(internalUserIdForClerk("user_abc"));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(internalUserIdForClerk("user_OTHER")).not.toBe(a);
  });
});

describe("listUserWorkspaces + cross-workspace isolation", () => {
  it("returns only the caller's memberships — never the demo tenant", async () => {
    const alice = internalUserIdForClerk("user_alice");
    const bob = internalUserIdForClerk("user_bob");
    const aWs = await createWorkspace(testDb.db, {
      slug: `w-alice-${Date.now()}`,
      name: "Alice ws",
      ownerUserId: alice,
    });
    const bWs = await createWorkspace(testDb.db, {
      slug: `w-bob-${Date.now()}`,
      name: "Bob ws",
      ownerUserId: bob,
    });
    const aliceList = await listUserWorkspaces(testDb.db, alice);
    const bobList = await listUserWorkspaces(testDb.db, bob);
    expect(aliceList.map((w) => w.id)).toContain(aWs.id);
    expect(aliceList.map((w) => w.id)).not.toContain(bWs.id);
    expect(bobList.map((w) => w.id)).not.toContain(aWs.id);
    // Neither discovers the seeded demo workspace
    expect(aliceList.map((w) => w.id)).not.toContain(DEMO_WORKSPACE_ID);
    // Foreign memberships resolve to null
    expect(await getWorkspaceMember(testDb.db, aWs.id, bob)).toBeNull();
    expect(await getWorkspaceMember(testDb.db, DEMO_WORKSPACE_ID, alice)).toBeNull();
  });

  it("empty list for an account with no memberships (fail closed)", async () => {
    expect(await listUserWorkspaces(testDb.db, internalUserIdForClerk("user_none"))).toEqual([]);
  });
});

describe("keyless demo guarantee", () => {
  it("clerkConfigured is false without a publishable key", () => {
    expect(clerkConfigured({} as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(
      clerkConfigured({
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_x",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe(true);
  });
});
