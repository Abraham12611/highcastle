/**
 * Pattern A guest executor tests — the strict contract for model-authored
 * code (issue #54). Verifies real execution, real denials, real bounds:
 * a generated program either performs allowlisted lab calls and returns
 * observed data, or is refused with an explicit reason. Nothing simulated.
 */

import { describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";

import { runGuestProgram, validateProgramSource, programDigest } from "./guest.ts";
import { authorizeModelProgram } from "../modelProgram.ts";
import { sha256Hex, redactSecrets, truncate } from "./util.ts";
import type { LabResponse } from "./http.ts";

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
        headers: { authorization: `Bearer ${bearerToken}` },
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
            revisionEcho: null,
          });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function withStubLab(fn: (origin: string) => Promise<void>): Promise<void> {
  const server = http.createServer((req, res) => {
    if (req.url === "/api/invoices/invoice_A") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ invoice: { id: "invoice_A", ownerId: "user_A" } }));
      return;
    }
    if (req.url === "/api/invoices/invoice_B") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ invoice: { id: "invoice_B", ownerId: "user_B" } }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

const BOLA_PROGRAM = `
const meta = await lab.get("/api/meta");
const me = await lab.get("/api/auth/whoami");
const own = await lab.get("/api/invoices/invoice_A");
const cross = await lab.get("/api/invoices/invoice_B");
return {
  identity: me.body?.actor?.userId ?? null,
  crossStatus: cross.status,
  crossOwner: cross.body?.invoice?.ownerId ?? null,
};
`;

describe("validateProgramSource", () => {
  it("accepts a bounded model-authored program", () => {
    expect(validateProgramSource(BOLA_PROGRAM).ok).toBe(true);
  });
  it("rejects escape-vector tokens", () => {
    for (const bad of [
      'const x = require("fs")',
      "process.exit(1)",
      'await fetch("http://evil")',
      "globalThis.constructor",
      'eval("1")',
      "new Function('x')",
      "obj.__proto__.x = 1",
      'import("node:fs")',
    ]) {
      expect(validateProgramSource(bad).ok, bad).toBe(false);
    }
  });
  it("rejects oversized, empty and non-ASCII sources", () => {
    expect(validateProgramSource("").ok).toBe(false);
    expect(validateProgramSource("x".repeat(5000)).ok).toBe(false);
    expect(validateProgramSource("const π = 1").ok).toBe(false);
  });
});

describe("runGuestProgram — real execution", () => {
  it("executes a model-style program and returns real observed facts", async () => {
    await withStubLab(async (origin) => {
      const out = await runGuestProgram(BOLA_PROGRAM, {
        labOrigin: origin,
        bearerToken: "lab-token-alice",
        maxRequests: 8,
        labGetFn: labGetForTest,
      });
      expect(out.status).toBe("ok");
      expect(out.requestsMade).toBe(4);
      expect(out.exchanges.map((e) => e.path)).toContain("/api/invoices/invoice_B");
      const ret = JSON.parse(out.output) as Record<string, unknown>;
      expect(ret["crossStatus"]).toBe(200);
      expect(ret["crossOwner"]).toBe("user_B");
    });
  });

  it("denies paths outside the allowlist", async () => {
    await withStubLab(async (origin) => {
      const out = await runGuestProgram('return await lab.get("/etc/passwd")', {
        labOrigin: origin,
        bearerToken: "lab-token-alice",
        maxRequests: 8,
        labGetFn: labGetForTest,
      });
      expect(out.status).toBe("denied");
      expect(out.requestsMade).toBe(0);
    });
  });

  it("denies traversal/absolute-url tricks", async () => {
    await withStubLab(async (origin) => {
      for (const p of ["/api/../etc", "//evil.com/x", "/api//x"]) {
        const out = await runGuestProgram(`return await lab.get(${JSON.stringify(p)})`, {
          labOrigin: origin,
          bearerToken: "lab-token-alice",
          maxRequests: 8,
          labGetFn: labGetForTest,
        });
        expect(out.status, p).toBe("denied");
      }
    });
  });

  it("enforces the request budget", async () => {
    await withStubLab(async (origin) => {
      const out = await runGuestProgram(
        `for (let i = 0; i < 10; i++) { await lab.get("/health"); } return "done";`,
        { labOrigin: origin, bearerToken: "t", maxRequests: 3, labGetFn: labGetForTest },
      );
      expect(out.status).toBe("budget_exceeded");
      expect(out.requestsMade).toBe(3);
    });
  });

  it("bounds wall-clock between awaits", async () => {
    await withStubLab(async (origin) => {
      const out = await runGuestProgram(
        `await new Promise(() => {}); return "done"; // never resolves`,
        {
          labOrigin: origin,
          bearerToken: "t",
          maxRequests: 8,
          labGetFn: labGetForTest,
          wallClockMs: 100,
        },
      );
      expect(out.status).toBe("timeout");
    });
  });

  it("reports guest exceptions as program_error, not crashes", async () => {
    await withStubLab(async (origin) => {
      const out = await runGuestProgram(`throw new Error("guest exploded")`, {
        labOrigin: origin,
        bearerToken: "t",
        maxRequests: 8,
        labGetFn: labGetForTest,
      });
      expect(out.status).toBe("program_error");
      expect(out.output).toContain("guest exploded");
    });
  });
});

describe("authorizeModelProgram — strict contract", () => {
  const gen = { provider: "vultr-inference", model: "m", generatedAt: "2026-01-01T00:00:00Z" };
  it("pins sha256 and language on a valid draft", () => {
    const auth = authorizeModelProgram({ source: BOLA_PROGRAM, generator: gen });
    expect(auth.language).toBe("js-subset-v1");
    expect(auth.sha256).toBe(programDigest(BOLA_PROGRAM));
  });
  it("rejects malformed drafts and rejected sources", () => {
    expect(() => authorizeModelProgram({ source: 'require("fs")', generator: gen })).toThrow();
    expect(() => authorizeModelProgram({ generator: gen })).toThrow();
    expect(() =>
      authorizeModelProgram({ source: "x", generator: { ...gen, provider: "openai" } }),
    ).toThrow();
  });
});
