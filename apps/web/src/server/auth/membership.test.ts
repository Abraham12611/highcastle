import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getWorkspaceMember } from "@highcastle/db";
import { createTestDb, type TestDb } from "../db";
import {
  internalUserIdForClerk,
  listUserWorkspaces,
  provisionAccountWorkspace,
} from "./membership";
import { clerkConfigured } from "./clerk";
import { DEMO_WORKSPACE_ID } from "../../lib/auth/session-core";

let testDb: TestDb;
beforeAll(async () => {
  testDb = await createTestDb();
}, 60_000);
afterAll(async () => {
  await testDb.close();
});

const CLERK_USER = "user_2testprovisioning";

describe("provisionAccountWorkspace", () => {
  it("creates a personal workspace + owner membership on first sign-in", async () => {
    const uid = internalUserIdForClerk(CLERK_USER);
    const ws = await provisionAccountWorkspace(testDb.db, uid);
    expect(ws).toHaveLength(1);
    expect(ws[0]?.role).toBe("owner");
    expect(ws[0]?.name).toBe("Personal workspace");
    // membership row is real — tenant authorization can see it
    const member = await getWorkspaceMember(testDb.db, ws[0]!.id, uid);
    expect(member?.role).toBe("owner");
  });

  it("is idempotent — repeated calls never duplicate workspaces", async () => {
    const uid = internalUserIdForClerk(CLERK_USER);
    const a = await provisionAccountWorkspace(testDb.db, uid);
    const b = await provisionAccountWorkspace(testDb.db, uid);
    expect(b).toHaveLength(1);
    expect(b[0]?.id).toBe(a[0]?.id);
  });

  it("never grants the seeded demo workspace to a real account", async () => {
    const uid = internalUserIdForClerk(CLERK_USER);
    const ws = await provisionAccountWorkspace(testDb.db, uid);
    expect(ws.map((w) => w.id)).not.toContain(DEMO_WORKSPACE_ID);
    // and cannot read the demo workspace as a member
    const member = await getWorkspaceMember(testDb.db, DEMO_WORKSPACE_ID, uid);
    expect(member).toBeNull();
  });
});

describe("cross-workspace isolation", () => {
  it("users only discover their own memberships", async () => {
    const alice = internalUserIdForClerk("user_alice");
    const bob = internalUserIdForClerk("user_bob");
    const aWs = await provisionAccountWorkspace(testDb.db, alice);
    const bWs = await provisionAccountWorkspace(testDb.db, bob);
    expect(aWs).toHaveLength(1);
    expect(bWs).toHaveLength(1);
    expect(aWs[0]?.id).not.toBe(bWs[0]?.id);
    // bob's discovery never surfaces alice's workspace
    const bobList = await listUserWorkspaces(testDb.db, bob);
    expect(bobList.map((w) => w.id)).not.toContain(aWs[0]?.id);
    // and bob holds no membership in alice's workspace
    expect(await getWorkspaceMember(testDb.db, aWs[0]!.id, bob)).toBeNull();
  });
});

describe("keyless demo guarantee", () => {
  it("clerkConfigured is false without a publishable key", () => {
    expect(clerkConfigured({} as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(
      clerkConfigured({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_x" } as unknown as NodeJS.ProcessEnv),
    ).toBe(true);
  });
});
