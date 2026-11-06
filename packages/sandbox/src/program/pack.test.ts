/**
 * Pack program tests against a REAL local HTTP server implementing the
 * documented lab API semantics (vulnerable + patched). These exercise the
 * actual socket path — real requests, real response bytes, real hashes —
 * only without the container boundary.
 */

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";

import { TEST_PACK_MANIFEST } from "@highcastle/contracts";

import { PACK_MAX_REQUESTS, runBolaInvoiceV1 } from "./pack.ts";
import { ALLOWED_LAB_ORIGINS, labGet, type LabResponse } from "./http.ts";
import { sha256Hex, redactSecrets, truncate } from "./util.ts";

const INVOICE_A = {
  id: "invoice_A",
  tenantId: "tenant_A",
  ownerId: "user_A",
  customer: { name: "Alice Fixture", email: "alice@targetlab.test" },
  amountCents: 129_900,
};
const INVOICE_B = {
  id: "invoice_B",
  tenantId: "tenant_B",
  ownerId: "user_B",
  customer: { name: "Bob Fixture", email: "bob@targetlab.test" },
  amountCents: 54_250,
};

function labHandler(revision: "vulnerable" | "patched") {
  return (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => {
    const authed = req.headers.authorization === "Bearer lab-token-alice";
    const url = new URL(req.url ?? "/", "http://x");
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (url.pathname === "/api/meta") {
      return json(200, { revision, fixtureSet: "alice-bob-invoices" });
    }
    if (url.pathname === "/api/auth/whoami") {
      return authed
        ? json(200, { actor: { userId: "user_A", tenantId: "tenant_A", label: "alice" } })
        : json(401, { error: { code: "UNAUTHENTICATED" } });
    }
    const m = /^\/api\/invoices\/(.+)$/.exec(url.pathname);
    if (m) {
      if (!authed) return json(401, { error: { code: "UNAUTHENTICATED" } });
      const id = m[1];
      if (id === "invoice_A") return json(200, { invoice: INVOICE_A });
      if (id === "invoice_B") {
        // Patched: tenant-scoped lookup — invisible to alice's tenant.
        if (revision === "patched") return json(404, { error: { code: "INVOICE_NOT_FOUND" } });
        return json(200, { invoice: INVOICE_B });
      }
      return json(404, { error: { code: "INVOICE_NOT_FOUND" } });
    }
    return json(404, { error: { code: "NOT_FOUND" } });
  };
}

describe("pack budget parity", () => {
  it("PACK_MAX_REQUESTS mirrors the frozen manifest", () => {
    expect(PACK_MAX_REQUESTS).toBe(TEST_PACK_MANIFEST["bola-invoice-v1"].maxRequests);
  });
});

describe.each(["vulnerable", "patched"] as const)(
  "runBolaInvoiceV1 against a %s lab",
  (revision) => {
    let server: http.Server;
    let origin: string;

    beforeAll(async () => {
      server = http.createServer(labHandler(revision));
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
      const { port } = server.address() as AddressInfo;
      origin = `http://127.0.0.1:${port}`;
    });
    afterAll(async () => {
      await new Promise((r) => server.close(r));
    });

    it(`produces honest evidence (revision=${revision})`, async () => {
      // The injected labGet ignores the origin allowlist semantics only in
      // that the test server lives on a non-allowlisted port — the allowlist
      // itself is tested separately. Behavior is the real socket path.
      const outcome = await runBolaInvoiceV1(origin, "lab-token-alice", 8, (o, path, token) =>
        labGetForTest(o, path, token),
      );

      expect(outcome.preconditionPassed).toBe(true);
      expect(outcome.fatalError).toBeNull();
      expect(outcome.requestsMade).toBe(4);
      expect(outcome.exchanges).toHaveLength(4);
      expect(outcome.exchanges.map((e) => e.path)).toEqual([
        "/api/meta",
        "/api/auth/whoami",
        "/api/invoices/invoice_A",
        "/api/invoices/invoice_B",
      ]);
      // Body hashes are real sha256 of response bytes.
      for (const e of outcome.exchanges) {
        expect(e.bodyHash).toMatch(/^[0-9a-f]{64}$/);
      }

      expect(outcome.baselineAssertion.passed).toBe(true);
      if (revision === "vulnerable") {
        expect(outcome.negativeAssertion.passed).toBe(false);
        expect(outcome.observedFixtureOwner).toBe("bob");
        expect(outcome.exchanges[3]?.status).toBe(200);
      } else {
        expect(outcome.negativeAssertion.passed).toBe(true);
        expect(outcome.observedFixtureOwner).toBe("none");
        expect(outcome.exchanges[3]?.status).toBe(404);
      }
    });
  },
);

// The production labGet validates the allowlist — for tests we bypass only
// the static origin check by calling http.request directly with the same
// request shape (GET, bearer, no redirects, bounded body).
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
