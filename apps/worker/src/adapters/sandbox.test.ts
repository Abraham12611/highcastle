/**
 * DirectPackExecutor tests: REAL L15 pack code over a stubbed lab HTTP
 * transport — the same code path that runs against the deployed lab.
 * Asserts the executor returns genuine adjudications (never booleans
 * invented by the adapter).
 */
import { describe, expect, it } from "vitest";
import { createSandboxExecutor } from "./sandbox.js";
import type { SandboxRequest } from "@highcastle/contracts";

const REVISION = "lab-v1-vulnerable";
const REVISION_HEADERS = { "x-target-lab-revision": REVISION };

const VULNERABLE_BODY = {
  meta: {
    revision: REVISION,
    fixtureVersion: "1.0.0",
    fixtureSet: "alice-bob-invoices",
    fixtures: {
      invoices: [
        { id: "invoice_A", ownerId: "user_A", tenantId: "tenant_A" },
        { id: "invoice_B", ownerId: "user_B", tenantId: "tenant_B" },
      ],
    },
  },
  whoami: { actor: { userId: "user_A", tenantId: "tenant_A", label: "alice" } },
  invoice_A: {
    invoice: { id: "invoice_A", ownerId: "user_A", tenantId: "tenant_A", number: "INV-2026-0001" },
  },
  invoice_B: {
    invoice: { id: "invoice_B", ownerId: "user_B", tenantId: "tenant_B", number: "INV-2026-0002" },
  },
};

function labFetch(responses: typeof VULNERABLE_BODY): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0]) => {
    const url = input.toString();
    if (url.endsWith("/health") || url.endsWith("/ready")) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: REVISION_HEADERS,
      });
    }
    if (url.endsWith("/api/auth/login")) {
      return new Response(JSON.stringify(responses.whoami), {
        status: 200,
        headers: {
          ...REVISION_HEADERS,
          "set-cookie": "lab_session=synthetic-alice-session; Path=/",
        },
      });
    }
    const key = url.endsWith("/api/meta")
      ? "meta"
      : url.endsWith("/api/auth/whoami")
        ? "whoami"
        : url.endsWith("/api/invoices/invoice_A")
          ? "invoice_A"
          : url.endsWith("/api/invoices/invoice_B")
            ? "invoice_B"
            : null;
    if (!key) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(responses[key as keyof typeof responses]), {
      status: 200,
      headers: { "content-type": "application/json", ...REVISION_HEADERS },
    });
  }) as typeof fetch;
}

const REQUEST: SandboxRequest = {
  schemaVersion: 1,
  scanId: "00000000-0000-4000-8000-000000000001" as never,
  attemptId: "00000000-0000-4000-8000-000000000002" as never,
  policyHash: "a".repeat(64) as never,
  packId: "bola-invoice-v1",
  packVersion: "1.0.0",
  targetServiceAlias: "target-lab",
  actorCredentialRef: "ref:synthetic:alice_session" as never,
  nonce: "deadbeef".repeat(8) as never,
  permittedMethods: ["GET"],
  limits: {
    maxDurationSeconds: 30,
    maxRequests: 8,
    maxMemoryMb: 512,
    maxCpuMillicores: 1000,
    maxPids: 64,
  },
  targetImageDigest: "lab@sha256:" + "c".repeat(64),
};

describe("DirectPackExecutor (real L15 pack over stub transport)", () => {
  it("executes the real pack and returns the oracle's reproduced verdict on the vulnerable lab", async () => {
    const executor = createSandboxExecutor({
      mode: "direct",
      env: { HIGHCASTLE_LAB_BASE_URL: "http://lab.test" } as never,
      fetchImpl: labFetch(VULNERABLE_BODY),
    });
    const run = await executor.execute(REQUEST, {
      workspaceId: "00000000-0000-4000-8000-000000000003" as never,
      expectedRevision: "lab-v1-vulnerable",
    });
    expect(run.kind).toBe("executed");
    if (run.kind !== "executed") return;
    expect(run.outcome).toBe("completed");
    expect(run.result).not.toBeNull();
    // Genuine L15 oracle adjudication over real parsed legs:
    expect(run.adjudication?.verdict).toBe("reproduced");
    expect(run.adjudication?.baseline).toBe("pass");
    expect(run.adjudication?.securityCheck).toBe("fail");
    expect(run.adjudication?.preconditionsOk).toBe(true);
  });

  it("adjudicates not_reproduced when the patched lab denies the cross-account read", async () => {
    const patched = {
      ...VULNERABLE_BODY,
      invoice_B: { error: { code: "forbidden" } } as never,
    };
    const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => {
      const res = await labFetch(patched)(input);
      if (input.toString().endsWith("/api/invoices/invoice_B")) {
        return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
      }
      return res;
    }) as typeof fetch;

    const executor = createSandboxExecutor({
      mode: "direct",
      env: { HIGHCASTLE_LAB_BASE_URL: "http://lab.test" } as never,
      fetchImpl,
    });
    const run = await executor.execute(
      { ...REQUEST, nonce: "cafebabe".repeat(8) as never },
      {
        workspaceId: "00000000-0000-4000-8000-000000000003" as never,
        expectedRevision: "lab-v1-vulnerable",
      },
    );
    expect(run.kind).toBe("executed");
    if (run.kind !== "executed") return;
    expect(run.adjudication?.verdict).toBe("not_reproduced");
  });
});
