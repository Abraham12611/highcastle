/**
 * observationsFromRun — strict mapping of runner ParsedObservation legs to
 * the L15 oracle's AttemptObservations. Missing, inconsistent or duplicate
 * legs must yield null (→ inconclusive), never a partial-evidence verdict.
 */
import { describe, expect, it } from "vitest";
import { observationsFromRun } from "./sandbox.js";
import type { ParsedObservation } from "@highcastle/sandbox";

const REV = "lab-v1-vulnerable";
const H = { revisionEcho: REV, at: new Date().toISOString() };

function leg(step: string, status = 200, body: unknown = { ok: true }): ParsedObservation {
  return { step, status, body, revisionEcho: REV, at: H.at };
}

const FULL: ParsedObservation[] = [
  leg("health"),
  leg("ready"),
  leg("meta", 200, { revision: REV, fixtureVersion: "1.0.0", fixtureSet: "alice-bob-invoices" }),
  leg("whoami", 200, { actor: { userId: "user_A", tenantId: "tenant_A", label: "alice" } }),
  leg("own_invoice", 200, {
    invoice: { id: "invoice_A", ownerId: "user_A", tenantId: "tenant_A" },
  }),
  leg("cross_invoice", 403, { error: { code: "forbidden" } }),
];

describe("observationsFromRun", () => {
  it("maps a complete six-leg observation set", () => {
    const obs = observationsFromRun("att-1", REV, FULL);
    expect(obs).not.toBeNull();
    expect(obs?.health.status).toBe(200);
    expect(obs?.ownInvoice.status).toBe(200);
    expect(obs?.crossInvoice.status).toBe(403);
    expect(obs?.attemptId).toBe("att-1");
    expect(obs?.expectedRevision).toBe(REV);
  });
  it("returns null on a missing leg", () => {
    expect(observationsFromRun("a", REV, FULL.slice(0, 5))).toBeNull();
  });
  it("returns null on a duplicate leg", () => {
    expect(observationsFromRun("a", REV, [...FULL, leg("meta")])).toBeNull();
  });
  it("returns null on an unexpected step", () => {
    expect(observationsFromRun("a", REV, [...FULL, leg("bogus")])).toBeNull();
  });
  it("returns null on empty/absent observations", () => {
    expect(observationsFromRun("a", REV, [])).toBeNull();
    expect(observationsFromRun("a", REV, null)).toBeNull();
    expect(observationsFromRun("a", REV, undefined)).toBeNull();
  });
  it("returns null when whoami actor does not match own-invoice owner", () => {
    const bad = FULL.map((o) =>
      o.step === "whoami"
        ? leg("whoami", 200, { actor: { userId: "user_B", tenantId: "tenant_B" } })
        : o,
    );
    expect(observationsFromRun("a", REV, bad)).toBeNull();
  });
  it("returns null when whoami actor is missing/unresolved", () => {
    const bad = FULL.map((o) => (o.step === "whoami" ? leg("whoami", 200, {}) : o));
    expect(observationsFromRun("a", REV, bad)).toBeNull();
  });
  it("returns null when whoami leg itself is non-200", () => {
    const bad = FULL.map((o) => (o.step === "whoami" ? leg("whoami", 401, {}) : o));
    expect(observationsFromRun("a", REV, bad)).toBeNull();
  });
  it("returns null on a malformed leg (non-number status)", () => {
    const bad = FULL.map((o) => (o.step === "meta" ? { ...o, status: "200" as never } : o));
    expect(observationsFromRun("a", REV, bad)).toBeNull();
  });
  it("accepts legs in any order — order is not evidence (issue #92)", () => {
    const shuffled = [...FULL].reverse();
    const obs = observationsFromRun("a", REV, shuffled);
    expect(obs).not.toBeNull();
    expect(obs?.crossInvoice.status).toBe(403);
  });
  it("returns null when whoami resolves an actor but own_invoice owner differs", () => {
    const bad = FULL.map((o) =>
      o.step === "own_invoice"
        ? leg("own_invoice", 200, {
            invoice: { id: "invoice_A", ownerId: "user_B", tenantId: "tenant_B" },
          })
        : o,
    );
    expect(observationsFromRun("a", REV, bad)).toBeNull();
  });
  it("returns null when the own_invoice leg body is not a record", () => {
    const bad = FULL.map((o) =>
      o.step === "own_invoice" ? leg("own_invoice", 200, "not-json-body") : o,
    );
    expect(observationsFromRun("a", REV, bad)).toBeNull();
  });
  it("tolerates a primitive cross_invoice body — the oracle grades it, not the mapper", () => {
    const raw = FULL.map((o) =>
      o.step === "cross_invoice" ? leg("cross_invoice", 403, "opaque-denial") : o,
    );
    const obs = observationsFromRun("a", REV, raw);
    expect(obs).not.toBeNull();
    expect(obs?.crossInvoice.body).toBe("opaque-denial");
  });
});

describe("ContainerExecutor — Pattern A program passthrough", () => {
  it("forwards ctx.program to the controller and reports provenance", async () => {
    const seen: unknown[] = [];
    const stubController = {
      execute: (req: unknown, ctx: unknown) => {
        seen.push(ctx);
        return Promise.resolve({
          kind: "executed",
          request: req,
          runner: { id: "r1", status: "cleanup_verified" },
          outcome: "completed",
          result: null,
          resultError: null,
          containmentEvents: [],
          probes: [],
          observations: [],
          programResult: {
            status: "ok",
            output: '{"crossOwner":"user_B"}',
            requestsMade: 4,
            durationMs: 900,
            programSha256: "a".repeat(64),
          },
          exitCode: 0,
        });
      },
      cancel: () => Promise.resolve(),
      reconcileOrphans: () =>
        Promise.resolve({ inspected: 0, reaped: [], markedLost: [], errors: [] }),
    };
    const { ContainerExecutor } = await import("./sandbox.js");
    const exec = new ContainerExecutor(stubController as never, {});
    const program = {
      language: "js-subset-v1" as const,
      source: "return 1",
      sha256: "b".repeat(64),
      generator: { provider: "vultr-inference" as const, model: "m", generatedAt: "t" },
    };
    const out = await exec.execute(
      { attemptId: "a1" } as never,
      { workspaceId: "w1", program } as never,
    );
    expect(out.kind).toBe("executed");
    const forwarded = seen[0] as { program?: unknown };
    expect(forwarded.program).toBe(program);
    if (out.kind === "executed") {
      expect(out.program?.sha256).toBe("b".repeat(64));
      expect(out.program?.model).toBe("m");
      expect(out.program?.result?.status).toBe("ok");
      expect(out.program?.result?.requestsMade).toBe(4);
    }
  });

  it("env-gated generator: absent program → generator produces an authorized one", async () => {
    const draft = {
      source: "return { ok: true }",
      generator: { provider: "vultr-inference" as const, model: "m", generatedAt: "t" },
    };
    const generator = {
      generate: () => Promise.resolve(draft),
    };
    const seen: unknown[] = [];
    const stubController = {
      execute: (_req: unknown, ctx: unknown) => {
        seen.push(ctx);
        return Promise.resolve({
          kind: "executed",
          request: _req,
          runner: { id: "r1", status: "cleanup_verified" },
          outcome: "completed",
          result: null,
          resultError: null,
          containmentEvents: [],
          probes: [],
          observations: [],
          programResult: null,
          exitCode: 0,
        });
      },
      cancel: () => Promise.resolve(),
      reconcileOrphans: () =>
        Promise.resolve({ inspected: 0, reaped: [], markedLost: [], errors: [] }),
    };
    const { ContainerExecutor } = await import("./sandbox.js");
    const exec = new ContainerExecutor(stubController as never, {
      programGenerator: generator as never,
    });
    const out = await exec.execute(
      { attemptId: "a1", limits: { maxRequests: 8 } } as never,
      { workspaceId: "w1" } as never,
    );
    expect(out.kind).toBe("executed");
    const forwarded = seen[0] as { program?: { sha256?: string } };
    expect(forwarded.program?.sha256).toMatch(/^[0-9a-f]{64}$/);
    if (out.kind === "executed") expect(out.program?.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
