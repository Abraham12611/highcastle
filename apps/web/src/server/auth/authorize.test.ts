import { describe, expect, it } from "vitest";
import {
  DEMO_PACK_ID,
  DEMO_PROJECT_ID,
  DEMO_SCOPE_ID,
  DEMO_TARGET_ALIAS,
  DEMO_WORKSPACE_ID,
  type AccountSession,
  type DemoSession,
} from "../../lib/auth/session-core";
import { authorizeScanRead, authorizeWorkspaceAction, type MembershipPort } from "./authorize";

const OTHER_WS = "b0b0b0b0-0000-4000-8000-000000000009";
const FIXED = { projectId: DEMO_PROJECT_ID, targetAlias: DEMO_TARGET_ALIAS, packId: DEMO_PACK_ID, scopeId: DEMO_SCOPE_ID };

const demo: DemoSession = {
  kind: "demo",
  userId: "guest-x",
  sessionId: "s1",
  expiresAt: Date.now() + 60_000,
  workspaceId: DEMO_WORKSPACE_ID,
  projectId: "a0a0a0a0-0000-4000-8000-000000000002",
  targetAlias: "target-lab",
};
const account = (userId: string): AccountSession => ({ kind: "account", userId, sessionId: "s2", expiresAt: Date.now() + 60_000 });
const roles = (map: Record<string, string>): MembershipPort => ({
  getWorkspaceRole: async (_ws, uid) => map[uid] ?? null,
});

describe("demo session privileges", () => {
  it("allows read actions in the demo workspace only", async () => {
    for (const type of ["read-scan", "read-project", "read-events"] as const) {
      await expect(authorizeWorkspaceAction(demo, { type, workspaceId: DEMO_WORKSPACE_ID })).resolves.toBe(true);
      await expect(authorizeWorkspaceAction(demo, { type, workspaceId: OTHER_WS })).resolves.toBe(false);
    }
  });

  it("denies non-scan mutations and verdict writes for a guest", async () => {
    for (const type of ["cancel-scan", "write-verdict", "manage-scope"] as const) {
      await expect(authorizeWorkspaceAction(demo, { type, workspaceId: DEMO_WORKSPACE_ID })).resolves.toBe(false);
    }
  });

  it("allows the bounded demo scan and replay ONLY with the exact fixed tuple", async () => {
    for (const type of ["create-scan", "create-replay"] as const) {
      await expect(authorizeWorkspaceAction(demo, { type, workspaceId: DEMO_WORKSPACE_ID, ...FIXED })).resolves.toBe(true);
    }
  });

  it("denies any deviation in the bounded tuple", async () => {
    const bad = [
      { ...FIXED, targetAlias: "evil.example.com" },
      { ...FIXED, targetAlias: "target-lab-patched" },
      { ...FIXED, packId: "sql-injection-v9" },
      { ...FIXED, projectId: OTHER_WS },
      { ...FIXED, scopeId: OTHER_WS },
      { targetAlias: DEMO_TARGET_ALIAS, packId: DEMO_PACK_ID, scopeId: DEMO_SCOPE_ID }, // missing projectId
      { projectId: DEMO_PROJECT_ID, packId: DEMO_PACK_ID, scopeId: DEMO_SCOPE_ID }, // missing targetAlias
      { projectId: DEMO_PROJECT_ID, targetAlias: DEMO_TARGET_ALIAS, packId: DEMO_PACK_ID }, // missing scopeId
    ];
    for (const type of ["create-scan", "create-replay"] as const) {
      for (const params of bad) {
        await expect(
          authorizeWorkspaceAction(demo, { type, workspaceId: DEMO_WORKSPACE_ID, ...params }),
        ).resolves.toBe(false);
      }
      await expect(
        authorizeWorkspaceAction(demo, { type, workspaceId: OTHER_WS, ...FIXED }),
      ).resolves.toBe(false);
    }
  });
});

describe("account session privileges", () => {
  it("requires membership — no backend or no row means deny", async () => {
    await expect(authorizeWorkspaceAction(account("u1"), { type: "read-scan", workspaceId: DEMO_WORKSPACE_ID })).resolves.toBe(false);
    await expect(
      authorizeWorkspaceAction(account("u1"), { type: "read-scan", workspaceId: DEMO_WORKSPACE_ID }, roles({})),
    ).resolves.toBe(false);
  });

  it("cross-workspace: member of A cannot read workspace B", async () => {
    const port = roles({ u1: "owner" }); // u1 is owner of NOTHING in B — port only returns role for queried ws? simulate via port keyed by ws
    const byWs: MembershipPort = { getWorkspaceRole: async (ws, uid) => (ws === OTHER_WS && uid === "u1" ? null : "owner") };
    await expect(authorizeWorkspaceAction(account("u1"), { type: "read-scan", workspaceId: OTHER_WS }, byWs)).resolves.toBe(false);
    await expect(authorizeWorkspaceAction(account("u1"), { type: "read-scan", workspaceId: DEMO_WORKSPACE_ID }, port)).resolves.toBe(true);
  });

  it("viewer cannot mutate; developer can run approved checks; verdict never client-writable", async () => {
    const viewer = roles({ v: "viewer" });
    const dev = roles({ d: "developer" });
    const admin = roles({ a: "admin" });
    await expect(authorizeWorkspaceAction(account("v"), { type: "create-scan", workspaceId: DEMO_WORKSPACE_ID }, viewer)).resolves.toBe(false);
    await expect(authorizeWorkspaceAction(account("d"), { type: "create-scan", workspaceId: DEMO_WORKSPACE_ID }, dev)).resolves.toBe(true);
    await expect(authorizeWorkspaceAction(account("a"), { type: "manage-scope", workspaceId: DEMO_WORKSPACE_ID }, admin)).resolves.toBe(true);
    for (const [uid, port] of [["v", viewer], ["d", dev], ["a", admin]] as const) {
      await expect(authorizeWorkspaceAction(account(uid), { type: "write-verdict", workspaceId: DEMO_WORKSPACE_ID }, port)).resolves.toBe(false);
    }
  });
});

describe("authorizeScanRead (L17 contract)", () => {
  const lookup = (scope: { workspaceId: string; projectId: string } | null) => async () => scope;
  const demoScope = { workspaceId: DEMO_WORKSPACE_ID, projectId: "a0a0a0a0-0000-4000-8000-000000000002" };

  it("guest reads a scan inside the demo workspace", async () => {
    await expect(authorizeScanRead(demo, "scan-1", lookup(demoScope))).resolves.toEqual(demoScope);
  });

  it("guest is denied scans in other workspaces (404 semantics)", async () => {
    await expect(authorizeScanRead(demo, "scan-2", lookup({ workspaceId: OTHER_WS, projectId: "p" }))).resolves.toBeNull();
    await expect(authorizeScanRead(demo, "missing", lookup(null))).resolves.toBeNull();
  });
});
