/**
 * HighCastle target-lab HTTP application.
 *
 * One deliberate difference between revisions, isolated to invoice lookup:
 *   lab-v1-vulnerable: findById() ignores tenant/ownership -> BOLA reproduces.
 *   lab-v2-patched:    findByIdForTenant() scopes to actor tenant -> cross-tenant
 *                      reads are indistinguishable from a missing object (404).
 *
 * Authentication is still REQUIRED on the vulnerable revision; the defect is
 * missing object-level authorization, not missing authentication.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { ErrorCode, LabRevision, ResponseMeta } from "./types.ts";
import { ACTORS, actorForToken, FixtureStore, FIXTURE_VERSION, sessionIdFor, SESSION_COOKIE, TENANTS } from "./fixtures.ts";
import { resolveActor } from "./auth.ts";

export interface LabConfig {
  revision: LabRevision;
  /** Optional source identifier baked at build/deploy (recorded, never invented). */
  sourceSha?: string;
}

interface Context {
  config: LabConfig;
  store: FixtureStore;
  req: IncomingMessage;
  res: ServerResponse;
  meta: ResponseMeta;
}

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
} as const;

function sendJson(res: ServerResponse, status: number, body: unknown, extraHeaders: Record<string, string> = {}): void {
  res.writeHead(status, { ...JSON_HEADERS, ...extraHeaders });
  res.end(JSON.stringify(body, null, 2));
}

function sendError(ctx: Context, status: number, code: ErrorCode, message: string, extraHeaders: Record<string, string> = {}): void {
  sendJson(ctx.res, status, { error: { code, message }, meta: ctx.meta }, extraHeaders);
}

const MAX_BODY_BYTES = 16 * 1024;

function readJsonBody(req: IncomingMessage): Promise<{ ok: true; value: unknown } | { ok: false }> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let failed = false;
    req.on("data", (chunk: Buffer) => {
      if (failed) return; // keep draining so the socket stays usable for the 400
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        failed = true;
        resolve({ ok: false });
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (failed) return;
      try {
        resolve({ ok: true, value: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
      } catch {
        resolve({ ok: false });
      }
    });
    req.on("error", () => resolve({ ok: false }));
  });
}

function handleHealth(ctx: Context): void {
  const { revision } = ctx.config;
  sendJson(ctx.res, 200, {
    status: "ok",
    revision,
    fixtureVersion: FIXTURE_VERSION,
    uptimeSeconds: Math.round(process.uptime() * 100) / 100,
  });
}

function handleReady(ctx: Context): void {
  const expected = 2;
  const ready = ctx.store.count() === expected;
  sendJson(ctx.res, ready ? 200 : 503, {
    status: ready ? "ready" : "not_ready",
    revision: ctx.config.revision,
    fixtureVersion: FIXTURE_VERSION,
    fixtures: { invoices: ctx.store.count(), expected },
  });
}

function handleMeta(ctx: Context): void {
  sendJson(ctx.res, 200, {
    service: "highcastle-target-lab",
    revision: ctx.config.revision,
    fixtureVersion: FIXTURE_VERSION,
    ...(ctx.config.sourceSha ? { sourceSha: ctx.config.sourceSha } : {}),
    authentication: {
      scheme: "fixture bearer token or lab_session cookie",
      login: "POST /api/auth/login {\"token\": \"<fixture token>\"}",
      note: "fixture token values are trusted lab config; they are never exposed by this API",
    },
    fixtures: {
      tenants: Object.values(TENANTS).map((t) => t.id),
      users: Object.values(ACTORS).map((a) => ({ userId: a.userId, tenantId: a.tenantId, label: a.label })),
      invoices: [
        { id: "invoice_A", ownerId: "user_A", tenantId: "tenant_A" },
        { id: "invoice_B", ownerId: "user_B", tenantId: "tenant_B" },
      ],
    },
    meta: ctx.meta,
  });
}

async function handleLogin(ctx: Context): Promise<void> {
  const parsed = await readJsonBody(ctx.req);
  if (!parsed.ok || typeof parsed.value !== "object" || parsed.value === null) {
    sendError(ctx, 400, "INVALID_REQUEST", "Expected JSON body {\"token\": \"<fixture token>\"}.");
    return;
  }
  const token = (parsed.value as Record<string, unknown>).token;
  // Login accepts only exact fixture tokens; anything else is a failed sign-in.
  const actor = typeof token === "string" ? actorForToken(token) : null;
  if (!actor) {
    sendError(ctx, 401, "UNAUTHENTICATED", "Unknown fixture token.");
    return;
  }
  sendJson(
    ctx.res,
    200,
    { actor, meta: ctx.meta },
    { "set-cookie": `${SESSION_COOKIE}=${sessionIdFor(actor)}; HttpOnly; Path=/; SameSite=Strict` },
  );
}

function handleLogout(ctx: Context): void {
  sendJson(
    ctx.res,
    200,
    { status: "logged_out", meta: ctx.meta },
    { "set-cookie": `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0` },
  );
}

function handleWhoami(ctx: Context): void {
  const actor = resolveActor(ctx.req);
  if (!actor) {
    sendError(ctx, 401, "UNAUTHENTICATED", "Authentication required. Supply a fixture bearer token or lab_session cookie.");
    return;
  }
  sendJson(ctx.res, 200, { actor, meta: ctx.meta });
}

function handleReset(ctx: Context): void {
  ctx.store.reset();
  sendJson(ctx.res, 200, {
    status: "reset",
    fixtureVersion: FIXTURE_VERSION,
    fixtures: { invoices: ctx.store.count() },
    meta: ctx.meta,
  });
}

function handleGetInvoice(ctx: Context, id: string): void {
  const actor = resolveActor(ctx.req);
  if (!actor) {
    sendError(ctx, 401, "UNAUTHENTICATED", "Authentication required. Supply a fixture bearer token or lab_session cookie.");
    return;
  }

  // ------------------------------------------------------------------
  // THE DELIBERATE DEFECT, isolated to this single lookup:
  //   lab-v1-vulnerable -> findById(id): no tenant/ownership predicate,
  //     so any authenticated actor can read any invoice by known id (BOLA).
  //   lab-v2-patched -> findByIdForTenant(id, actor.tenantId): object-level
  //     authorization enforced; cross-tenant objects are invisible (404).
  // ------------------------------------------------------------------
  const invoice =
    ctx.config.revision === "lab-v1-vulnerable"
      ? ctx.store.findById(id)
      : ctx.store.findByIdForTenant(id, actor.tenantId);

  if (!invoice) {
    sendError(ctx, 404, "INVOICE_NOT_FOUND", `No invoice '${id}' is visible to this account.`);
    return;
  }
  sendJson(ctx.res, 200, { invoice, meta: ctx.meta });
}

type Route = { method: string; pattern: RegExp; handler: (ctx: Context, params: RegExpMatchArray) => void | Promise<void> };

const ROUTES: Route[] = [
  { method: "GET", pattern: /^\/health$/, handler: (ctx) => handleHealth(ctx) },
  { method: "GET", pattern: /^\/ready$/, handler: (ctx) => handleReady(ctx) },
  { method: "GET", pattern: /^\/api\/meta$/, handler: (ctx) => handleMeta(ctx) },
  { method: "POST", pattern: /^\/api\/auth\/login$/, handler: (ctx) => handleLogin(ctx) },
  { method: "POST", pattern: /^\/api\/auth\/logout$/, handler: (ctx) => handleLogout(ctx) },
  { method: "GET", pattern: /^\/api\/auth\/whoami$/, handler: (ctx) => handleWhoami(ctx) },
  { method: "POST", pattern: /^\/api\/fixtures\/reset$/, handler: (ctx) => handleReset(ctx) },
  {
    method: "GET",
    pattern: /^\/api\/invoices\/([^/]+)$/,
    handler: (ctx, m) => {
      let id: string;
      try {
        id = decodeURIComponent(m[1]!);
      } catch {
        sendError(ctx, 400, "INVALID_REQUEST", "Malformed invoice id encoding.");
        return;
      }
      handleGetInvoice(ctx, id);
    },
  },
];

export function createRequestListener(config: LabConfig) {
  const store = new FixtureStore();

  return async function listener(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const requestId = randomUUID();
    const meta: ResponseMeta = { revision: config.revision, requestId };
    res.setHeader("x-target-lab-revision", config.revision);
    res.setHeader("x-request-id", requestId);

    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", "http://target-lab.local");
    const path = url.pathname;
    const ctx: Context = { config, store, req, res, meta };
    const actor = resolveActor(req);

    try {
      for (const route of ROUTES) {
        const match = route.pattern.exec(path);
        if (!match) continue;
        if (route.method !== method) {
          sendError(ctx, 405, "METHOD_NOT_ALLOWED", `Method ${method} not allowed on ${path}.`, { allow: route.method });
          logRequest(requestId, method, path, res.statusCode, actor?.userId ?? null);
          return;
        }
        await route.handler(ctx, match);
        logRequest(requestId, method, path, res.statusCode, actor?.userId ?? null);
        return;
      }
      sendError(ctx, 404, "NOT_FOUND", `No route for ${method} ${path}.`);
    } catch {
      if (!res.headersSent) {
        sendError(ctx, 500, "INTERNAL", "Unexpected lab error.");
      } else {
        res.end();
      }
    }
    logRequest(requestId, method, path, res.statusCode, actor?.userId ?? null);
  };
}

/** Structured, credential-free request log for evidence/containment review. */
function logRequest(requestId: string, method: string, path: string, status: number, actor: string | null): void {
  process.stdout.write(
    `${JSON.stringify({ ts: new Date().toISOString(), requestId, method, path, status, actor })}\n`,
  );
}
