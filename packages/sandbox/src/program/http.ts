/**
 * Allowlist-only HTTP client for the runner program.
 *
 * This is the *application-layer* half of egress control (the Docker internal
 * network is the runtime half — defense in depth). It can only ever address
 * the synthetic lab:
 *
 * - The origin is validated against a compile-time allowlist. Even a fully
 *   forged stdin envelope cannot steer requests elsewhere.
 * - Paths are compile-time constants chosen by the test pack; there is no
 *   code path that accepts a URL from the envelope, the model, or the lab's
 *   own responses.
 * - Redirects are NEVER followed. A 3xx is recorded as an exchange, not a
 *   navigation target.
 * - No proxy environment variables are honored (none are passed in anyway).
 */

import http from "node:http";

import { redactSecrets, sha256Hex, truncate } from "./util.ts";

/**
 * Origins the runner may ever connect to. The production entry is the
 * `target-lab` service alias on the internal lab network; loopback entries
 * exist ONLY for local development smoke runs outside Docker and are never
 * produced by the controller's deployment config.
 */
export const ALLOWED_LAB_ORIGINS: readonly string[] = [
  "http://target-lab:3000",
  "http://127.0.0.1:3030",
  "http://localhost:3030",
] as const;

export class LabOriginError extends Error {}

export function assertAllowedLabOrigin(origin: string): string {
  if (!ALLOWED_LAB_ORIGINS.includes(origin)) {
    throw new LabOriginError(
      `lab origin ${JSON.stringify(origin)} is not in the compile-time allowlist`,
    );
  }
  return origin;
}

export interface LabResponse {
  status: number;
  /** Raw body bytes captured (bounded). */
  body: string;
  bodyHash: string;
  bodyExcerptRedacted: string;
  durationMs: number;
}

const MAX_BODY_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 5_000;
const EXCERPT_MAX = 1_500;

/**
 * Single bounded GET against the lab origin. No redirects, no userinfo, no
 * client-supplied headers beyond Authorization + Accept. Any URL parsing or
 * network failure rejects — callers decide what that means.
 */
export function labGet(origin: string, path: string, bearerToken: string): Promise<LabResponse> {
  try {
    assertAllowedLabOrigin(origin);
  } catch (err) {
    return Promise.reject(err);
  }
  if (!path.startsWith("/") || path.includes("..") || /\s/.test(path)) {
    return Promise.reject(new Error(`refusing non-canonical lab path ${JSON.stringify(path)}`));
  }
  const url = new URL(path, origin);
  if (url.origin !== origin) {
    return Promise.reject(new Error(`resolved origin mismatch for ${JSON.stringify(path)}`));
  }

  return new Promise((resolve, reject) => {
    const started = Date.now();
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "GET",
        headers: {
          authorization: `Bearer ${bearerToken}`,
          accept: "application/json",
          "user-agent": "highcastle-runner/1 (+synthetic-lab-only)",
        },
        timeout: REQUEST_TIMEOUT_MS,
        // Deliberately no agent keep-alive pooling knobs that could smuggle
        // cross-request state; default agent is fine inside one attempt.
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        let overflow = false;
        res.on("data", (chunk: Buffer) => {
          if (overflow) return;
          size += chunk.length;
          if (size > MAX_BODY_BYTES) {
            overflow = true;
            res.destroy(new Error("lab response exceeded 64KiB body cap"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          resolve({
            status: res.statusCode ?? 0,
            body,
            bodyHash: sha256Hex(body),
            bodyExcerptRedacted: redactSecrets(truncate(body, EXCERPT_MAX)),
            durationMs: Date.now() - started,
          });
        });
        res.on("error", reject);
      },
    );
    req.on("timeout", () =>
      req.destroy(new Error(`lab request timed out after ${REQUEST_TIMEOUT_MS}ms`)),
    );
    req.on("error", reject);
    req.end();
  });
}
