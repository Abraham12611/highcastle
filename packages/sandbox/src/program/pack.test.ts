/**
 * Pack program tests against a REAL local HTTP server implementing the
 * documented lab API semantics. Exercises the actual socket path — only
 * without the container boundary. Covers precondition enforcement:
 * wrong actor (Bob), wrong revision, and fixture drift must yield
 * inconclusive evidence, never a misleading verdict-shaped result.
 */

import { describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";

import { TEST_PACK_MANIFEST } from "@highcastle/contracts";

import { PACK_MAX_REQUESTS, runBolaInvoiceV1, validateLabMeta } from "./pack.ts";
import { ALLOWED_LAB_ORIGINS, labGet, type LabResponse } from "./http.ts";
import { sha256Hex, redactSecrets, truncate } from "./util.ts";

const INVOICE_A = { id: "invoice_A", tenantId: "tenant_A", ownerId: "user_A" };
const INVOICE_B = { id: "invoice_B", tenantId: "tenant_B", ownerId: "user_B" };

const GOOD_META = {
  revision: "lab-v1-vulnerable",
  fixtureVersion: "1.0.0",
  fixtureSet: "alice-bob-invoices",
  fixtures: {
    invoices: [
      { id: "invoice_A", ownerId: "user_A", tenantId: "tenant_A" },
      { id: "invoice_B", ownerId: "user_B", tenantId: "tenant_B" },
    ],
  },
};

interface LabVariant {
  revision?: string;
  fixtureVersion?: string;
  fixtureSet?: string;
  patched?: boolean;
}

function labHandler(v: LabVariant) {
  const meta = {
    revision: v.revision ?? "lab-v1-vulnerable",
    fixtureVersion: v.fixtureVersion ?? "1.0.0",
    fixtureSet: v.fixtureSet ?? "alice-bob-invoices",
    fixtures: GOOD_META.fixtures,
  };
  return (req: http.IncomingMessage, res: http.ServerResponse) => {
    const token = req.headers.authorization === "Bearer lab-token-alice" ? "alice"
      : req.headers.authorization === "Bearer lab-token-bob" ? "bob" : null;
    const url = new URL(req.url ?? "/", "http://x");
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (url.pathname === "/api/meta") return json(200, meta);
    if (url.pathname === "/api/auth/whoami") {
      if (token === "alice") return json(200, { actor: { userId: "user_A", tenantId: "tenant_A" } });
      if (token === "bob") return json(200, { actor: { userId: "user_B", tenantId: "tenant_B" } });
      return json(401, { error: { code: "UNAUTHENTICATED" } });
    }
    const m = /^\/api\/invoices\/(.+)$/.exec(url.pathname);
    if (m) {
      if (!token) return json(401, { error: { code: "UNAUTHENTICATED" } });
      const id = m[1];
      const tenantOf: Record<string, string> = { alice: "tenant_A", bob: "tenant_B" };
      if (id === "invoice_A" && (!v.patched || tenantOf[token] === "tenant_A")) {
        return json(200, { invoice: INVOICE_A });
      }
      if (id === "invoice_B" && (!v.patched || tenantOf[token] === "tenant_B")) {
        return json(200, { invoice: INVOICE_B });
      }
      return json(404, { error: { code: "INVOICE_NOT_FOUND" } });
    }
    return json(404, { error: { code: "NOT_FOUND" } });
  };
}

function labGetForTest(origin: string, path: string, bearerToken: string) {
  const url = new URL(path, origin);
  return new Promise<LabResponse>((resolve, reject) => {
    const started = Date.now();
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "GET",
        headers: { authorization: `Bearer ${bearerToken}`, accept: "application/json" },
        timeout: 5_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          resolve({
            status: res.statusCode ?? 0,
            body,
            bodyHash: sha256Hex(body),
            bodyExcerptRedacted: redactSecrets(truncate(body, 1500)),
            durationMs: Date.now() - started,
          });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function withLab(v: LabVariant, fn: (origin: string) => Promise<void>): Promise<void> {
  const server = http.createServer(labHandler(v));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

describe("pack budget parity", () => {
  it("PACK_MAX_REQUESTS mirrors the frozen manifest", () => {
    expect(PACK_MAX_REQUESTS).toBe(TEST_PACK_MANIFEST["bola-invoice-v1"].maxRequests);
  });
});

describe("validateLabMeta", () => {
  it("accepts the canonical frozen fixture contract", () => {
    expect(validateLabMeta(JSON.stringify(GOOD_META))).toBeNull();
  });
  it("rejects wrong revision, fixtureVersion, fixtureSet and owner drift", () => {
    for (const bad of [
      { ...GOOD_META, revision: "lab-v9-other" },
      { ...GOOD_META, fixtureVersion: "2.0.0" },
      { ...GOOD_META, fixtureSet: "other-set" },
      {
        ...GOOD_META,
        fixtures: {
          invoices: [
            { id: "invoice_A", ownerId: "user_X", tenantId: "tenant_A" },
            { id: "invoice_B", ownerId: "user_B", tenantId: "tenant_B" },
          ],
        },
      },
    ]) {
      expect(validateLabMeta(JSON.stringify(bad))).not.toBeNull();
    }
  });
});

describe("runBolaInvoiceV1 — preconditioned observations", () => {
  it("vulnerable lab + alice: baseline pass, cross-account returns bob's invoice", async () => {
    await withLab({}, async (origin) => {
      const out = await runBolaInvoiceV1(origin, "lab-token-alice", 8, labGetForTest);
      expect(out.preconditionsMet).toBe(true);
      expect(out.inconclusiveReason).toBeNull();
      expect(out.baselineAssertion.passed).toBe(true);
      expect(out.negativeAssertion.passed).toBe(false);
      expect(out.observedFixtureOwner).toBe("bob");
      expect(out.exchanges).toHaveLength(4);
    });
  });

  it("patched lab + alice: baseline pass, cross-account denied", async () => {
    await withLab({ patched: true, revision: "lab-v2-patched" }, async (origin) => {
      const out = await runBolaInvoiceV1(origin, "lab-token-alice", 8, labGetForTest);
      expect(out.preconditionsMet).toBe(true);
      expect(out.baselineAssertion.passed).toBe(true);
      expect(out.negativeAssertion.passed).toBe(true);
      expect(out.observedFixtureOwner).toBe("none");
    });
  });

  it("vulnerable lab + BOB token: inconclusive — never interpreted as Alice's exploit", async () => {
    await withLab({}, async (origin) => {
      const out = await runBolaInvoiceV1(origin, "lab-token-bob", 8, labGetForTest);
      // On the vulnerable lab Bob reads both invoices; the run must still be
      // marked uninterpretable because the actor was not Alice.
      expect(out.preconditionsMet).toBe(false);
      expect(out.inconclusiveReason).toContain("user_B");
      expect(out.baselineAssertion.passed).toBe(false);
      expect(out.baselineAssertion.detail).toContain("inconclusive");
      expect(out.negativeAssertion.passed).toBe(false);
      expect(out.negativeAssertion.detail).toContain("inconclusive");
      // No S1 interpretation happened at all — run stops at identity gate.
      expect(out.exchanges.map((e) => e.path)).not.toContain("/api/invoices/invoice_B");
    });
  });

  it("wrong lab revision: inconclusive, not executed", async () => {
    await withLab({ revision: "lab-v9-foreign" }, async (origin) => {
      const out = await runBolaInvoiceV1(origin, "lab-token-alice", 8, labGetForTest);
      expect(out.preconditionsMet).toBe(false);
      expect(out.inconclusiveReason).toContain("revision");
      expect(out.exchanges).toHaveLength(1); // only the meta probe ran
    });
  });

  it("fixture drift in meta: inconclusive, not executed", async () => {
    await withLab({ fixtureVersion: "2.0.0" }, async (origin) => {
      const out = await runBolaInvoiceV1(origin, "lab-token-alice", 8, labGetForTest);
      expect(out.preconditionsMet).toBe(false);
      expect(out.inconclusiveReason).toContain("fixtureVersion");
    });
  });

  it("unreachable lab: inconclusive", async () => {
    const out = await runBolaInvoiceV1("http://127.0.0.1:1", "lab-token-alice", 8, labGetForTest);
    expect(out.preconditionsMet).toBe(false);
    expect(out.inconclusiveReason).toContain("meta");
  });
});

describe("lab origin allowlist", () => {
  it("accepts only the lab alias and dev loopback entries", () => {
    expect(ALLOWED_LAB_ORIGINS).toContain("http://target-lab:3000");
    for (const bad of [
      "https://evil.example",
      "http://169.254.169.254",
      "http://target-lab.evil.com:3000",
      "http://internal-db:5432",
    ]) {
      expect(ALLOWED_LAB_ORIGINS).not.toContain(bad);
    }
  });

  it("rejects requests to non-allowlisted origins", async () => {
    await expect(labGet("https://evil.example", "/x", "t")).rejects.toThrow(/allowlist/);
  });
});
