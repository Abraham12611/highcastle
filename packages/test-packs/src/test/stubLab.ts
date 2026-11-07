/**
 * Wire-compatible stub of the L11 synthetic invoice lab (L15-owned test
 * double).
 *
 * Implements ONLY the documented lab surface (`GET /health`, `/ready`,
 * `/api/meta`, `POST /api/auth/login`, `GET /api/auth/whoami`,
 * `GET /api/invoices/:id`, revision headers, fixture tokens) with
 * selectable lookup semantics (`vulnerable` vs `patched`) and corruption
 * modes for negative-path tests. It exists so this package's wire tests
 * run on `develop` without depending on L11-owned code; conformance to the
 * real lab is a matter of shared documented contract, and any drift fails
 * tests loudly instead of passing silently.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export const STUB_ALICE_TOKEN = "lab-token-alice";
export const STUB_BOB_TOKEN = "lab-token-bob";

export type StubBehavior = "vulnerable" | "patched";
export type StubCorruption =
  "none" | "own-500" | "own-wrong-owner" | "leaky-denial" | "meta-drift" | "login-401";

export interface StubLabOptions {
  revision: "lab-v1-vulnerable" | "lab-v2-patched";
  behavior: StubBehavior;
  corruption?: StubCorruption;
}

export interface StubLab {
  baseUrl: string;
  requestsSeen: number;
  close: () => Promise<void>;
}

interface Actor {
  userId: string;
  tenantId: string;
  label: string;
}

const ACTORS: Record<string, Actor> = {
  "lab-token-alice": { userId: "user_A", tenantId: "tenant_A", label: "alice" },
  "lab-token-bob": { userId: "user_B", tenantId: "tenant_B", label: "bob" },
};

function sessionFor(userId: string): string {
  return `lab-session-${userId}`;
}

const INVOICES: Record<string, Record<string, unknown>> = {
  invoice_A: {
    id: "invoice_A",
    number: "INV-2026-0001",
    tenantId: "tenant_A",
    ownerId: "user_A",
  },
  invoice_B: {
    id: "invoice_B",
    number: "INV-2026-0002",
    tenantId: "tenant_B",
    ownerId: "user_B",
  },
};

/**
 * Redirector stub: answers every request with `302 Found` pointing at the
 * target base URL. The pack must fail closed on this (reject the redirect)
 * instead of silently following it onto another host.
 */
export async function startRedirector(targetBaseUrl: string): Promise<StubLab> {
  let requestsSeen = 0;
  const server: Server = createServer((req, res) => {
    requestsSeen += 1;
    const location = new URL(req.url ?? "/", targetBaseUrl).toString();
    res.writeHead(302, { location });
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    get requestsSeen() {
      return requestsSeen;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export async function startStubLab(options: StubLabOptions): Promise<StubLab> {
  const corruption = options.corruption ?? "none";
  let requestsSeen = 0;
  let requestCounter = 0;

  function send(
    res: ServerResponse,
    status: number,
    body: unknown,
    extraHeaders: Record<string, string> = {},
  ): void {
    requestCounter += 1;
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "x-target-lab-revision": options.revision,
      "x-request-id": `stub-req-${requestCounter}`,
      ...extraHeaders,
    });
    res.end(JSON.stringify(body));
  }

  function actorOf(req: IncomingMessage): Actor | null {
    const authorization = req.headers.authorization;
    if (typeof authorization === "string") {
      const match = /^Bearer\s+(\S+)\s*$/i.exec(authorization.trim());
      if (match) {
        const actor = ACTORS[match[1] ?? ""];
        if (actor) return actor;
      }
    }
    const cookie = req.headers.cookie;
    if (typeof cookie === "string") {
      for (const part of cookie.split(";")) {
        const eq = part.indexOf("=");
        if (eq === -1) continue;
        if (part.slice(0, eq).trim() === "lab_session") {
          const value = part.slice(eq + 1).trim();
          const found = Object.values(ACTORS).find((actor) => sessionFor(actor.userId) === value);
          if (found) return found;
        }
      }
    }
    return null;
  }

  function readBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown);
        } catch {
          resolve(null);
        }
      });
      req.on("error", () => resolve(null));
    });
  }

  const server: Server = createServer((req, res) => {
    requestsSeen += 1;
    void (async () => {
      const method = req.method ?? "GET";
      const url = new URL(req.url ?? "/", "http://stub.local");
      const path = url.pathname;

      if (method === "GET" && path === "/health") {
        send(res, 200, {
          status: "ok",
          revision: options.revision,
          fixtureVersion: corruption === "meta-drift" ? "9.9.9" : "1.0.0",
          uptimeSeconds: 1,
        });
        return;
      }
      if (method === "GET" && path === "/ready") {
        send(res, 200, {
          status: "ready",
          revision: options.revision,
          fixtureVersion: "1.0.0",
          fixtures: { invoices: 2, expected: 2 },
        });
        return;
      }
      if (method === "GET" && path === "/api/meta") {
        send(res, 200, {
          service: "highcastle-target-lab",
          revision: options.revision,
          fixtureVersion: corruption === "meta-drift" ? "9.9.9" : "1.0.0",
          fixtureSet: "alice-bob-invoices",
          fixtures: {
            tenants: ["tenant_A", "tenant_B"],
            users: [
              { userId: "user_A", tenantId: "tenant_A", label: "alice" },
              { userId: "user_B", tenantId: "tenant_B", label: "bob" },
            ],
            invoices: [
              { id: "invoice_A", ownerId: "user_A", tenantId: "tenant_A" },
              { id: "invoice_B", ownerId: "user_B", tenantId: "tenant_B" },
            ],
          },
          meta: { revision: options.revision, requestId: "stub-meta" },
        });
        return;
      }
      if (method === "POST" && path === "/api/auth/login") {
        const parsed = await readBody(req);
        const token =
          typeof parsed === "object" && parsed !== null
            ? (parsed as Record<string, unknown>)["token"]
            : null;
        const actor = typeof token === "string" ? ACTORS[token] : undefined;
        if (corruption === "login-401" || !actor) {
          send(res, 401, {
            error: { code: "UNAUTHENTICATED", message: "Unknown fixture token." },
            meta: { revision: options.revision, requestId: "stub-login" },
          });
          return;
        }
        send(
          res,
          200,
          { actor, meta: { revision: options.revision, requestId: "stub-login" } },
          {
            "set-cookie": `lab_session=${sessionFor(actor.userId)}; HttpOnly; Path=/; SameSite=Strict`,
          },
        );
        return;
      }

      const actor = actorOf(req);
      if (method === "GET" && path === "/api/auth/whoami") {
        if (!actor) {
          send(res, 401, {
            error: { code: "UNAUTHENTICATED", message: "Authentication required." },
            meta: { revision: options.revision, requestId: "stub-whoami" },
          });
          return;
        }
        send(res, 200, {
          actor,
          meta: { revision: options.revision, requestId: "stub-whoami" },
        });
        return;
      }
      if (method === "GET" && path.startsWith("/api/invoices/")) {
        if (!actor) {
          send(res, 401, {
            error: { code: "UNAUTHENTICATED", message: "Authentication required." },
            meta: { revision: options.revision, requestId: "stub-inv" },
          });
          return;
        }
        const id = decodeURIComponent(path.slice("/api/invoices/".length));
        if (id === "invoice_A" && corruption === "own-500") {
          send(res, 500, {
            error: { code: "INTERNAL", message: "Unexpected lab error." },
            meta: { revision: options.revision, requestId: "stub-inv" },
          });
          return;
        }
        let invoice = INVOICES[id];
        if (id === "invoice_A" && corruption === "own-wrong-owner") {
          invoice = INVOICES["invoice_B"]!;
        }
        if (!invoice) {
          send(res, 404, {
            error: { code: "INVOICE_NOT_FOUND", message: `No invoice '${id}' is visible.` },
            meta: { revision: options.revision, requestId: "stub-inv" },
          });
          return;
        }
        if (options.behavior === "patched" && invoice["tenantId"] !== actor.tenantId) {
          if (corruption === "leaky-denial") {
            send(res, 404, {
              error: { code: "INVOICE_NOT_FOUND", message: "No invoice is visible." },
              invoice,
              meta: { revision: options.revision, requestId: "stub-inv" },
            });
            return;
          }
          send(res, 404, {
            error: {
              code: "INVOICE_NOT_FOUND",
              message: `No invoice '${id}' is visible to this account.`,
            },
            meta: { revision: options.revision, requestId: "stub-inv" },
          });
          return;
        }
        send(res, 200, {
          invoice,
          meta: { revision: options.revision, requestId: "stub-inv" },
        });
        return;
      }
      send(res, 404, {
        error: { code: "NOT_FOUND", message: `No route for ${method} ${path}.` },
        meta: { revision: options.revision, requestId: "stub-404" },
      });
    })();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    get requestsSeen() {
      return requestsSeen;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
