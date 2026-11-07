import { describe, expect, it } from "vitest";
import type { PolicyDecision } from "./decisions.js";
import { checkPackAuthorization } from "./packs.js";
import {
  evaluatePlanAuthorization,
  evaluateRequestAuthorization,
  type PlanAuthorizationInput,
} from "./policy.js";
import {
  DEMO_NOW,
  FOREIGN_IDS,
  makeDemoEnvironment,
  makeDemoProject,
  makeDemoScope,
  makeDemoTarget,
  makeValidProposal,
} from "./testing.js";

function baseInput(overrides: Partial<PlanAuthorizationInput> = {}): PlanAuthorizationInput {
  return {
    scope: makeDemoScope(),
    project: makeDemoProject(),
    target: makeDemoTarget(),
    environment: makeDemoEnvironment(),
    proposal: makeValidProposal(),
    now: DEMO_NOW,
    ...overrides,
  };
}

function denyCodes(decision: PolicyDecision): string[] {
  return decision.decision === "deny" ? decision.reasons.map((r) => r.code) : [];
}

describe("evaluatePlanAuthorization — positive", () => {
  it("allows the exact approved H demo plan", () => {
    const decision = evaluatePlanAuthorization(baseInput());
    expect(decision.decision).toBe("allow");
    if (decision.decision !== "allow") return;
    expect(decision.policyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(decision.policyHash).toBe((baseInput().scope as { scopeHash: string }).scopeHash);
    const approval = decision.approval;
    if (approval.kind !== "execution") {
      throw new Error("expected execution approval");
    }
    expect(approval.packId).toBe("bola-invoice-v1");
    expect(approval.targetServiceAlias).toBe("target-lab");
    expect(approval.permittedMethods).toEqual(["GET"]);
    // Setup ops are explicitly scoped prerequisites — POST login declared,
    // GET-only test action surface NOT widened.
    expect(approval.setupOperations).toContainEqual({
      method: "POST",
      path: "/api/auth/login",
    });
    expect(
      approval.setupOperations.every((op) => op.method === "GET" || op.method === "POST"),
    ).toBe(true);
    // effective limits = min(operator 16req/120s, scope 16req/60s, pack 8req/30s)
    expect(approval.limits.maxRequests).toBe(8);
    expect(approval.limits.maxDurationSeconds).toBe(30);
    expect(approval.limits.maxMemoryMb).toBe(256);
    expect(approval.limits.maxConcurrency).toBe(1);
  });

  it("returns a deeply frozen decision (no post-hoc widening)", () => {
    const decision = evaluatePlanAuthorization(baseInput());
    expect(Object.isFrozen(decision)).toBe(true);
    if (decision.decision !== "allow") return;
    expect(Object.isFrozen(decision.approval)).toBe(true);
    if (decision.approval.kind !== "execution") return;
    expect(Object.isFrozen(decision.approval.limits)).toBe(true);
    expect(Object.isFrozen(decision.approval.permittedMethods)).toBe(true);
  });

  it("never runs the model's plan when the scope is narrower than the pack", () => {
    const scope = makeDemoScope({ maxRequests: 4 });
    const decision = evaluatePlanAuthorization(baseInput({ scope }));
    expect(decision.decision).toBe("allow");
    if (decision.decision !== "allow") return;
    if (decision.approval.kind !== "execution") return;
    // narrowed to the scope — pack declared 8 but scope approves 4
    expect(decision.approval.limits.maxRequests).toBe(4);
  });
});

describe("evaluatePlanAuthorization — scope validity", () => {
  it("denies an expired scope", () => {
    const scope = makeDemoScope({ expiresAt: "2026-11-06T11:00:00.000Z" });
    const decision = evaluatePlanAuthorization(baseInput({ scope }));
    expect(denyCodes(decision)).toContain("scope_expired");
  });

  it("denies a scope marked expired at exactly `now`", () => {
    const scope = makeDemoScope({ expiresAt: DEMO_NOW.toISOString() });
    const decision = evaluatePlanAuthorization(baseInput({ scope }));
    expect(denyCodes(decision)).toContain("scope_expired");
  });

  it("denies a revoked scope", () => {
    const scope = makeDemoScope({ status: "revoked" });
    const decision = evaluatePlanAuthorization(baseInput({ scope }));
    expect(denyCodes(decision)).toContain("scope_revoked");
  });

  it("denies a scope whose approval timestamp is in the future", () => {
    const scope = makeDemoScope({ approvedAt: "2026-11-06T13:00:00.000Z" });
    const decision = evaluatePlanAuthorization(baseInput({ scope }));
    expect(denyCodes(decision)).toContain("scope_not_yet_valid");
  });

  it("denies a tampered scope (hash mismatch) before any other check", () => {
    const scope = makeDemoScope();
    const widened = {
      ...scope,
      allowedHosts: ["target-lab", "evil.example.com"],
      maxRequests: 100,
    };
    const decision = evaluatePlanAuthorization(baseInput({ scope: widened }));
    expect(denyCodes(decision)).toEqual(["scope_hash_mismatch"]);
  });

  it("denies a malformed scope payload", () => {
    const decision = evaluatePlanAuthorization(baseInput({ scope: { id: "x" } }));
    expect(denyCodes(decision)).toEqual(["scope_malformed"]);
    expect(decision.decision === "deny" && decision.policyHash).toBe(null);
  });
});

describe("evaluatePlanAuthorization — authorization relations", () => {
  it("denies a target belonging to another workspace", () => {
    const target = makeDemoTarget({
      workspaceId: FOREIGN_IDS.workspaceId,
    });
    const decision = evaluatePlanAuthorization(baseInput({ target }));
    expect(denyCodes(decision)).toContain("workspace_mismatch");
  });

  it("denies a scope pointing at a different project", () => {
    const project = makeDemoProject({
      id: FOREIGN_IDS.projectId,
    });
    const decision = evaluatePlanAuthorization(baseInput({ project }));
    expect(denyCodes(decision)).toContain("project_mismatch");
  });

  it("denies an unverified target", () => {
    const target = makeDemoTarget({ state: "pending_verification" });
    const decision = evaluatePlanAuthorization(baseInput({ target }));
    expect(denyCodes(decision)).toContain("target_not_verified");
  });

  it("denies a target whose verification expired", () => {
    const target = makeDemoTarget({
      verificationExpiresAt: "2026-11-06T11:00:00.000Z",
    });
    const decision = evaluatePlanAuthorization(baseInput({ target }));
    expect(denyCodes(decision)).toContain("target_not_verified");
  });

  it("denies a destroyed environment", () => {
    const environment = makeDemoEnvironment({ provisionStatus: "destroyed" });
    const decision = evaluatePlanAuthorization(baseInput({ environment }));
    expect(denyCodes(decision)).toContain("environment_not_ready");
  });

  it("denies a non-demo target kind (no executable alias)", () => {
    const target = makeDemoTarget({ targetKind: "staging" });
    const decision = evaluatePlanAuthorization(baseInput({ target }));
    expect(denyCodes(decision)).toContain("unsupported_target_kind");
  });

  it("denies an archived project", () => {
    const project = makeDemoProject({ lifecycle: "archived" });
    const decision = evaluatePlanAuthorization(baseInput({ project }));
    expect(denyCodes(decision)).toContain("project_not_active");
  });
});

describe("evaluatePlanAuthorization — model proposal rejection", () => {
  it("denies a proposal naming an unknown pack", () => {
    const proposal = {
      ...makeValidProposal(),
      requestedTest: { packId: "run-any-shell-v9", objective: "x" },
    };
    const decision = evaluatePlanAuthorization(baseInput({ proposal }));
    expect(denyCodes(decision)).toContain("proposal_unknown_pack");
  });

  it("denies a prompt-injected proposal carrying extra permission fields", () => {
    const proposal = {
      ...makeValidProposal(),
      shellCommand: "curl http://169.254.169.254/latest/meta-data",
      grantPermissions: ["network.egress_any"],
      targetUrl: "https://victim.example.com",
    };
    const decision = evaluatePlanAuthorization(baseInput({ proposal }));
    expect(denyCodes(decision)).toContain("proposal_forbidden_field");
  });

  it("denies a proposal whose pack is not in the approved scope", () => {
    // With a single enumerated pack the contract itself prevents a valid
    // scope from listing zero packs, so exercise the pack gate directly —
    // the check exists for exactly this scope-vs-plan mismatch.
    const scope = makeDemoScope();
    const gate = checkPackAuthorization(
      { ...scope, allowedTestPackIds: ["bola-invoice-v1"] },
      "bola-invoice-v1",
    );
    expect(gate).toHaveLength(0);
    const denied = checkPackAuthorization({ ...scope, allowedTestPackIds: [] }, "bola-invoice-v1");
    expect(denied.map((r) => r.code)).toContain("pack_not_permitted");
  });

  it("denies a proposal with a stale schema version", () => {
    const proposal = { ...makeValidProposal(), schemaVersion: 2 };
    const decision = evaluatePlanAuthorization(baseInput({ proposal }));
    expect(denyCodes(decision)).toContain("proposal_stale_version");
  });

  it("denies an empty/garbage proposal", () => {
    for (const proposal of [null, undefined, {}, "run the exploit"]) {
      const decision = evaluatePlanAuthorization(baseInput({ proposal }));
      expect(decision.decision).toBe("deny");
      expect(denyCodes(decision)).toContain("proposal_empty");
    }
  });

  it("denies a proposal with shell metacharacters in the objective", () => {
    const proposal = {
      ...makeValidProposal(),
      requestedTest: {
        packId: "bola-invoice-v1",
        objective: "ok; `curl evil.example.com`",
      },
    };
    const decision = evaluatePlanAuthorization(baseInput({ proposal }));
    expect(denyCodes(decision)).toContain("proposal_malformed");
  });

  it("denies a malformed relation object before evaluating the proposal", () => {
    const decision = evaluatePlanAuthorization(baseInput({ target: { id: "nope" } }));
    expect(denyCodes(decision)).toContain("target_malformed");
  });
});

describe("evaluateRequestAuthorization — per-action gate", () => {
  const okRequest = () => ({
    scope: makeDemoScope(),
    packId: "bola-invoice-v1",
    method: "GET",
    path: "/api/invoices/inv_A",
    now: DEMO_NOW,
  });

  it("permits an in-scope GET on an allowed path", () => {
    const decision = evaluateRequestAuthorization(okRequest());
    expect(decision.decision).toBe("allow");
    if (decision.decision !== "allow") return;
    if (decision.approval.kind !== "request") {
      throw new Error("expected request");
    }
    expect(decision.approval.path).toBe("/api/invoices/inv_A");
    expect(decision.approval.host).toBeNull();
  });

  it("denies a method not in the pack manifest/scope", () => {
    const decision = evaluateRequestAuthorization({
      ...okRequest(),
      method: "DELETE",
    });
    expect(denyCodes(decision)).toContain("method_not_permitted");
  });

  it("denies a path outside every allowed prefix", () => {
    const decision = evaluateRequestAuthorization({
      ...okRequest(),
      path: "/api/users",
    });
    expect(denyCodes(decision)).toContain("path_not_permitted");
  });

  it("denies a path under a denied prefix even when allowed prefix covers it", () => {
    const decision = evaluateRequestAuthorization({
      ...okRequest(),
      path: "/api/invoices/admin/dump",
    });
    expect(denyCodes(decision)).toContain("path_explicitly_denied");
  });

  it("denies encoded traversal disguised as an invoice path", () => {
    for (const path of [
      "/api/invoices/../admin",
      "/api/invoices/%2e%2e/admin",
      "/api/invoices/%252e%252e/admin",
      "/api/invoices/..%2fadmin",
    ]) {
      const decision = evaluateRequestAuthorization({
        ...okRequest(),
        path,
      });
      expect(decision.decision).toBe("deny");
    }
  });

  it("denies a query-string carrying path that escapes scope", () => {
    const decision = evaluateRequestAuthorization({
      ...okRequest(),
      path: "/api/users?next=/api/invoices",
    });
    expect(denyCodes(decision)).toContain("path_not_permitted");
  });

  it("denies an out-of-scope or unsafe host", () => {
    for (const host of [
      "169.254.169.254",
      "127.0.0.1",
      "localhost",
      "metadata.google.internal",
      "other-workspace.example.com",
      "target-lab.evil.com",
    ]) {
      const decision = evaluateRequestAuthorization({
        ...okRequest(),
        host,
      });
      expect(decision.decision).toBe("deny");
    }
  });

  it("permits the in-scope demo host", () => {
    const decision = evaluateRequestAuthorization({
      ...okRequest(),
      host: "target-lab",
    });
    expect(decision.decision).toBe("allow");
  });

  it("denies when the scope is expired even if the request looks valid", () => {
    const scope = makeDemoScope({ expiresAt: "2026-11-06T11:00:00.000Z" });
    const decision = evaluateRequestAuthorization({ ...okRequest(), scope });
    expect(denyCodes(decision)).toContain("scope_expired");
  });
});

describe("evaluateRequestAuthorization — setup prerequisites", () => {
  const setupRequest = (overrides: Record<string, unknown> = {}) => ({
    scope: makeDemoScope(),
    packId: "bola-invoice-v1",
    method: "POST",
    path: "/api/auth/login",
    purpose: "setup" as const,
    now: DEMO_NOW,
    ...overrides,
  });

  it("permits the declared session-setup POST on the lab", () => {
    const decision = evaluateRequestAuthorization(setupRequest());
    expect(decision.decision).toBe("allow");
    if (decision.decision !== "allow") return;
    if (decision.approval.kind !== "setup") {
      throw new Error("expected setup approval");
    }
    expect(decision.approval.method).toBe("POST");
    expect(decision.approval.path).toBe("/api/auth/login");
  });

  it("permits declared read prerequisites (health, ready, whoami)", () => {
    for (const [method, path] of [
      ["GET", "/health"],
      ["GET", "/ready"],
      ["GET", "/api/meta"],
      ["GET", "/api/auth/whoami"],
      ["POST", "/api/auth/logout"],
    ] as const) {
      const decision = evaluateRequestAuthorization(setupRequest({ method, path }));
      expect(decision.decision, `${method} ${path}`).toBe("allow");
    }
  });

  it("denies a setup POST that is not a declared prerequisite", () => {
    for (const path of [
      "/api/invoices/inv_A", // real route, but not a prerequisite
      "/api/auth/login/../admin",
      "/api/admin",
      "/api/auth/login/extra",
    ]) {
      const decision = evaluateRequestAuthorization(setupRequest({ path }));
      expect(decision.decision, path).toBe("deny");
      expect(denyCodes(decision)).toContain("setup_op_not_permitted");
    }
  });

  it("denies setup verbs outside GET/POST (no PUT/DELETE ever)", () => {
    for (const method of ["PUT", "DELETE", "PATCH"]) {
      const decision = evaluateRequestAuthorization(
        setupRequest({ method, path: "/api/auth/login" }),
      );
      expect(decision.decision, method).toBe("deny");
      expect(denyCodes(decision)).toContain("setup_op_not_permitted");
    }
  });

  it("denies setup ops when a denied scope prefix covers them", () => {
    const scope = makeDemoScope({ deniedPaths: ["/api/auth"] });
    const decision = evaluateRequestAuthorization(setupRequest({ scope }));
    expect(denyCodes(decision)).toContain("path_explicitly_denied");
  });

  it("does NOT let a POST through the test-action path", () => {
    const decision = evaluateRequestAuthorization({
      scope: makeDemoScope(),
      packId: "bola-invoice-v1",
      method: "POST",
      path: "/api/auth/login",
      // purpose: "test" (default) — POST must stay denied as a test action
      now: DEMO_NOW,
    });
    expect(denyCodes(decision)).toContain("method_not_permitted");
  });
});
