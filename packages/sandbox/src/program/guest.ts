/**
 * Pattern A guest executor — runs MODEL-AUTHORED JavaScript inside the
 * ephemeral runner container (issue #54).
 *
 * Two-layer model, honestly scoped:
 *   - `node:vm` provides a LANGUAGE-SURFACE constraint: the guest sees only
 *     `lab.get`, `print`, and JS intrinsics — no require/process/fs/net/fetch.
 *   - The CONTAINER remains the actual security boundary (non-root, read-only
 *     rootfs, dropped caps, internal network, cgroup caps) — unchanged L14
 *     enforcement, so a vm-context escape cannot reach the host.
 *
 * Hard bounds enforced here: source size/charset, forbidden escape tokens,
 * GET-only lab API, canonical path allowlist, request budget, wall-clock
 * deadline, output size cap. The runner's outer deadline watchdog is the
 * backstop for a guest that spins the event loop.
 */

import vm from "node:vm";

import { labGet, type LabResponse } from "./http.ts";
import { emit, nowIso, sha256Hex, truncate, redactSecrets } from "./util.ts";

export const PROGRAM_LANGUAGE = "js-subset-v1" as const;
export const MAX_PROGRAM_SOURCE_BYTES = 4096;
export const MAX_PROGRAM_OUTPUT_BYTES = 4096;
export const PROGRAM_WALL_CLOCK_MS = 20_000;
export const GUEST_SYNC_TIMEOUT_MS = 1_500;

/** Canonical lab paths map to observation step names for the L15 handoff. */
const PATH_TO_STEP: Record<string, string> = {
  "/health": "health",
  "/ready": "ready",
  "/api/meta": "meta",
  "/api/auth/whoami": "whoami",
  "/api/invoices/invoice_A": "own_invoice",
  "/api/invoices/invoice_B": "cross_invoice",
};

/** Path allowlist: lab API only — no traversal, no absolute URLs, no admin. */
const ALLOWED_PATH = /^\/(api\/[a-zA-Z0-9_/.-]+|health|ready)$/;
const FORBIDDEN_PATH_PARTS = ["..", "//", "\\", " ", "%"];

/**
 * Escape-vector tokens rejected before vm evaluation. This is a filter —
 * NOT the boundary; the container is.
 */
const FORBIDDEN_TOKENS = [
  "require",
  "process",
  "module",
  "exports",
  "import",
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "globalThis",
  "eval",
  "Function(",
  "__proto__",
  "constructor",
  "child_process",
  "Worker",
  "importScripts",
  "Reflect",
  "Proxy",
  "async function",
];

export interface SourceValidation {
  ok: boolean;
  reason: string | null;
}

/** Static gate applied by the controller AND re-checked inside the image. */
export function validateProgramSource(source: string): SourceValidation {
  if (source.length === 0) return { ok: false, reason: "empty source" };
  if (source.length > MAX_PROGRAM_SOURCE_BYTES) {
    return { ok: false, reason: `source exceeds ${MAX_PROGRAM_SOURCE_BYTES} bytes` };
  }
  if (!/^[\x20-\x7E\n\t]+$/.test(source)) {
    return { ok: false, reason: "source contains non-printable/non-ASCII characters" };
  }
  for (const token of FORBIDDEN_TOKENS) {
    if (source.includes(token)) {
      return { ok: false, reason: `forbidden token present: ${token}` };
    }
  }
  try {
    new vm.Script(`(async () => {\n${source}\n})`, { filename: "guest.js" });
  } catch (err) {
    return {
      ok: false,
      reason: `syntax error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  return { ok: true, reason: null };
}

export type GuestStatus = "ok" | "program_error" | "budget_exceeded" | "timeout" | "denied";

export interface GuestExchange {
  method: "GET";
  path: string;
  status: number;
  bodyHash: string;
  bodyExcerptRedacted?: string;
}

export interface GuestExecution {
  status: GuestStatus;
  /** Bounded, redacted return value (or error message). */
  output: string;
  requestsMade: number;
  durationMs: number;
  /** Real exchanges the guest performed — same evidence shape as the pack. */
  exchanges: GuestExchange[];
}

export interface GuestDeps {
  labOrigin: string;
  bearerToken: string;
  maxRequests: number;
  labGetFn?: typeof labGet;
  /** Wall-clock bound for the guest (tests override; default 20s). */
  wallClockMs?: number;
}

/**
 * Execute the model-authored source as the body of an async function.
 * Every `lab.get` enforces the path allowlist + budget; each call is
 * recorded as an exchange + observation line for L15.
 */
export async function runGuestProgram(source: string, deps: GuestDeps): Promise<GuestExecution> {
  const started = Date.now();
  let requestsMade = 0;
  const budget = deps.maxRequests;
  const http = deps.labGetFn ?? labGet;
  const exchanges: GuestExchange[] = [];

  function guestPrint(...args: unknown[]): void {
    emit({
      v: 1,
      type: "log",
      at: nowIso(),
      level: "info",
      msg: truncate(redactSecrets(args.map(String).join(" ")), 500),
    });
  }

  async function guestGet(path: string): Promise<{ status: number; body: unknown }> {
    if (typeof path !== "string" || !ALLOWED_PATH.test(path)) {
      throw new Error(`denied: path not in allowlist: ${String(path).slice(0, 80)}`);
    }
    if (FORBIDDEN_PATH_PARTS.some((p) => path.includes(p))) {
      throw new Error(`denied: path contains forbidden segment: ${String(path).slice(0, 80)}`);
    }
    if (requestsMade >= budget) {
      throw new Error(`denied: request budget exhausted (${budget})`);
    }
    requestsMade += 1;
    const res: LabResponse = await http(deps.labOrigin, path, deps.bearerToken);
    const exchange = {
      method: "GET" as const,
      path,
      status: res.status,
      bodyHash: res.bodyHash,
      ...(res.bodyExcerptRedacted !== "" ? { bodyExcerptRedacted: res.bodyExcerptRedacted } : {}),
    };
    exchanges.push(exchange);
    emit({ v: 1, type: "exchange", at: nowIso(), exchange });
    let parsedBody: unknown = null;
    try {
      parsedBody = JSON.parse(res.body);
    } catch {
      parsedBody = null;
    }
    emit({
      v: 1,
      type: "observation",
      at: nowIso(),
      step: (PATH_TO_STEP[path] ?? "program") as never,
      status: res.status,
      body: parsedBody,
      revisionEcho: res.revisionEcho,
    });
    return { status: res.status, body: parsedBody };
  }

  // The guest context exposes ONLY these two surfaces plus JS intrinsics.
  const context = vm.createContext(
    Object.freeze({ lab: Object.freeze({ get: guestGet }), print: guestPrint }),
    { name: "hc-guest", codeGeneration: { strings: false, wasm: false } },
  );

  const deadline = new Promise<never>((_r, reject) => {
    setTimeout(
      () => reject(new Error("guest deadline exceeded")),
      deps.wallClockMs ?? PROGRAM_WALL_CLOCK_MS,
    );
  });

  try {
    const wrapped = new vm.Script(`(async () => {\n${source}\n})()`, {
      filename: "guest.js",
    });
    const promise = wrapped.runInContext(context, {
      timeout: GUEST_SYNC_TIMEOUT_MS,
      breakOnSigint: false,
    });
    const value = await Promise.race([Promise.resolve(promise), deadline]);
    return {
      status: "ok",
      output: truncate(
        redactSecrets(typeof value === "string" ? value : (JSON.stringify(value) ?? "null")),
        MAX_PROGRAM_OUTPUT_BYTES,
      ),
      requestsMade,
      durationMs: Date.now() - started,
      exchanges,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status: GuestStatus = /budget exhausted/.test(msg)
      ? "budget_exceeded"
      : /^denied:/.test(msg)
        ? "denied"
        : /deadline exceeded|Script execution timed out/.test(msg)
          ? "timeout"
          : "program_error";
    return {
      status,
      output: truncate(redactSecrets(msg), 500),
      requestsMade,
      durationMs: Date.now() - started,
      exchanges,
    };
  }
}

/** sha256 of the program source — recorded as an artifact digest. */
export function programDigest(source: string): string {
  return sha256Hex(source);
}
