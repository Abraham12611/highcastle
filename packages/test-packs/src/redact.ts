/**
 * Evidence sanitization for bola-invoice-v1 (L15).
 *
 * Everything persisted or surfaced as evidence passes through here FIRST:
 * headers, request bodies, response excerpts. Digests cover the sanitized
 * bytes so a stored hash can never be mistaken for a hash of secret
 * material. Functions are lossy by design, never throw on hostile input,
 * and bound their output.
 *
 * Redaction policy (aligned with L04 redaction helpers, owned here so the
 * pack has no runtime dependency on `packages/security`):
 * - `authorization`, `cookie`, `set-cookie` (any case) are secrets by
 *   definition → replaced wholesale.
 * - Lab-only fixture token/session patterns inside excerpts are scrubbed
 *   defensively even though the lab never returns them.
 * - Query strings are stripped from recorded paths (pack requests never
 *   send one; a recorded query would be unexpected input, not evidence).
 */

import { createHash } from "node:crypto";

export const REDACTED_VALUE = "[REDACTED]" as const;

/** Maximum excerpt length: the contract cap for `bodyExcerptRedacted`. */
export const MAX_EXCERPT_CHARS = 2000;

/** Maximum single header value kept after redaction. */
const MAX_HEADER_VALUE_CHARS = 512;

const SENSITIVE_HEADER_NAMES = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
]);

const TOKEN_PATTERNS = [
  /lab-token-[A-Za-z0-9_-]+/g,
  /lab-session-[A-Za-z0-9_-]+/g,
  /Bearer\s+[A-Za-z0-9._~+/=-]+/g,
];

function scrubTokenPatterns(text: string): string {
  let out = text;
  for (const pattern of TOKEN_PATTERNS) {
    pattern.lastIndex = 0;
    out = out.replace(pattern, REDACTED_VALUE);
  }
  return out;
}

/** Redact one header value; secret headers are replaced wholesale. */
export function redactHeaderValue(name: string, value: string): string {
  if (SENSITIVE_HEADER_NAMES.has(name.toLowerCase())) {
    return REDACTED_VALUE;
  }
  const scrubbed = scrubTokenPatterns(value);
  return scrubbed.length > MAX_HEADER_VALUE_CHARS
    ? `${scrubbed.slice(0, MAX_HEADER_VALUE_CHARS)}…`
    : scrubbed;
}

/** Redact a header map (e.g. request/response headers kept for evidence). */
export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    out[name] = redactHeaderValue(name, value);
  }
  return out;
}

/**
 * Sanitize a request or response body for evidence: scrub token-shaped
 * material, then truncate to the contract excerpt cap. Accepts the raw body
 * text (already stringified); unparseable bytes are the caller's concern —
 * this function only guarantees bounded, secret-free output.
 */
export function sanitizeBodyExcerpt(bodyText: string): string {
  const scrubbed = scrubTokenPatterns(bodyText);
  return scrubbed.length > MAX_EXCERPT_CHARS
    ? `${scrubbed.slice(0, MAX_EXCERPT_CHARS)}…`
    : scrubbed;
}

/** Lowercase hex SHA-256 over the SANITIZED bytes. */
export function sha256Hex(sanitizedText: string): string {
  return createHash("sha256").update(sanitizedText, "utf8").digest("hex");
}

/**
 * Record a request path without any query string. The pack never sends
 * queries; stripping them guarantees no credential-shaped query value can
 * reach stored evidence.
 */
export function redactPath(path: string): string {
  const cut = path.indexOf("?");
  return cut === -1 ? path : path.slice(0, cut);
}
