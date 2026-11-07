/**
 * Secret and sensitive-field redaction.
 *
 * Applied to everything that may be persisted or surfaced: HTTP request/
 * response evidence, headers, URLs, model text, log artifacts, proposals.
 * The model's own output is redacted before storage too — a proposal or
 * stdout blob must not become a secret side-channel (T06/T18).
 *
 * Contract: these functions are lossy by design. They never throw, bound
 * their output, and replace secret-shaped material with `[REDACTED]`.
 * Redaction must run BEFORE hashing/storing evidence so stored digests cover
 * sanitized bytes (docs/security/03_DATA_HANDLING).
 */

export const REDACTED_VALUE = "[REDACTED]" as const;

const MAX_INPUT_CHARS = 1_000_000;
const DEFAULT_MAX_OUTPUT_CHARS = 20_000;
const MAX_HEADER_VALUE_CHARS = 512;

/** Header names that are secrets by definition (case-insensitive). */
const SENSITIVE_HEADER_NAMES = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-auth-token",
  "x-access-token",
  "x-refresh-token",
  "x-session-token",
  "x-csrf-token",
  "x-xsrf-token",
  "x-amz-security-token",
  "x-goog-api-key",
  "cf-access-token",
  "cf-access-jwt-assertion",
  "x-firebase-token",
  "x-hub-signature",
  "x-hub-signature-256",
]);

export function isSensitiveHeaderName(name: string): boolean {
  return SENSITIVE_HEADER_NAMES.has(name.trim().toLowerCase());
}

/** Object keys that are secrets by definition. */
const SENSITIVE_KEY_RE =
  /(?:password|passwd|pwd|secret|token|api[_-]?key|apikey|authorization|cookie|credential|session[_-]?id|session[_-]?token|private[_-]?key|client[_-]?secret|access[_-]?key|refresh[_-]?token|access[_-]?token|csrf|xsrf|signing[_-]?key|bearer)/i;

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_RE.test(key);
}

/**
 * Ordered secret-shaped text patterns, each with its replacement.
 * `keyed` patterns keep the key name (and scheme word / URL scheme) so
 * redacted evidence still shows *that* a credential was present, never the
 * value. Keep patterns linear — no nested quantifiers — so redaction stays
 * cheap on large inputs.
 */
interface TextSecretPattern {
  readonly re: RegExp;
  readonly replace: string | ((match: string) => string);
}

const TEXT_SECRET_PATTERNS: readonly TextSecretPattern[] = [
  {
    // PEM private-key blocks first (multi-line)
    re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]{0,20000}?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
    replace: `${REDACTED_VALUE}_PRIVATE_KEY_BLOCK`,
  },
  {
    // Credentials embedded in URL userinfo: scheme://user:pass@host
    re: /\b([a-z][a-z0-9+.-]{1,20}:\/\/)[^\s/"'@:]+:[^\s/"'@]+@/gi,
    replace: `$1${REDACTED_VALUE}@`,
  },
  {
    re: /\b(Bearer)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
    replace: `$1 ${REDACTED_VALUE}`,
  },
  {
    re: /\b(Basic)\s+[A-Za-z0-9+/]{8,}={0,2}/gi,
    replace: `$1 ${REDACTED_VALUE}`,
  },
  {
    // JWTs (header.payload.signature)
    re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b/g,
    replace: REDACTED_VALUE,
  },
  { re: /\bAKIA[0-9A-Z]{16}\b/g, replace: REDACTED_VALUE },
  { re: /\bASIA[0-9A-Z]{16}\b/g, replace: REDACTED_VALUE },
  {
    re: /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{8,}\b/g,
    replace: REDACTED_VALUE,
  },
  { re: /\bsk-[A-Za-z0-9_-]{16,}\b/g, replace: REDACTED_VALUE },
  { re: /\bgh[pousr]_[A-Za-z0-9]{16,}\b/g, replace: REDACTED_VALUE },
  {
    re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
    replace: REDACTED_VALUE,
  },
  { re: /\bglpat-[A-Za-z0-9_-]{16,}\b/g, replace: REDACTED_VALUE },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, replace: REDACTED_VALUE },
  { re: /\bhf_[A-Za-z0-9]{20,}\b/g, replace: REDACTED_VALUE },
  {
    // key=value / key: value pairs whose key name is sensitive — covers
    // JSON ("token": "v"), config (api_key=v) and query params (sig=v).
    re: /\b[A-Za-z0-9_.-]*(?:api[_-]?key|apikey|access[_-]?token|auth[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|secret|password|passwd|sessionid|session[_-]?id|private[_-]?key|signature|sig|csrf|xsrf)[A-Za-z0-9_.-]*\s*[=:]\s*["']?[^\s"',}\]&]{3,}/gi,
    replace: (match: string) =>
      match.replace(/([=:]\s*["']?)[^\s"',}\]&]{3,}\s*$/u, `$1${REDACTED_VALUE}`),
  },
];

/** True when a string value looks like it carries a credential. */
export function looksLikeSecret(value: string): boolean {
  if (value.length < 8) return false;
  return TEXT_SECRET_PATTERNS.some(({ re }) => {
    re.lastIndex = 0;
    return re.test(value);
  });
}

/**
 * Redact secret-shaped material from arbitrary text (model output, stdout,
 * log lines). Never throws; output bounded to `maxChars`.
 */
export function redactText(text: string, maxChars: number = DEFAULT_MAX_OUTPUT_CHARS): string {
  const input = text.length > MAX_INPUT_CHARS ? text.slice(0, MAX_INPUT_CHARS) : text;
  let out = input;
  for (const { re, replace } of TEXT_SECRET_PATTERNS) {
    re.lastIndex = 0;
    out =
      typeof replace === "string" ? out.replace(re, replace) : out.replace(re, (m) => replace(m));
  }
  const marker = "…[truncated]";
  return out.length > maxChars
    ? `${out.slice(0, Math.max(0, maxChars - marker.length))}${marker}`
    : out;
}

/**
 * Redact HTTP headers before persistence/evidence.
 * - Sensitive names → `[REDACTED]` regardless of value.
 * - Any name: secret-shaped values (Bearer tokens, JWTs, API keys) → `[REDACTED]`.
 * - Safe values are bounded to 512 chars.
 * `extraSensitiveNames` lets callers extend the deny list (never shrink it).
 */
export function redactHeaders(
  headers: Record<string, string> | Iterable<readonly [string, string]>,
  extraSensitiveNames: readonly string[] = [],
): Record<string, string> {
  const extra = new Set(extraSensitiveNames.map((n) => n.toLowerCase()));
  const entries: Iterable<readonly [string, string]> =
    Symbol.iterator in Object(headers)
      ? (headers as Iterable<readonly [string, string]>)
      : Object.entries(headers as Record<string, string>);

  const out: Record<string, string> = {};
  for (const [rawName, rawValue] of entries) {
    const name = String(rawName);
    const value = String(rawValue);
    if (
      isSensitiveHeaderName(name) ||
      extra.has(name.trim().toLowerCase()) ||
      looksLikeSecret(value)
    ) {
      out[name] = REDACTED_VALUE;
    } else {
      out[name] =
        value.length > MAX_HEADER_VALUE_CHARS
          ? `${value.slice(0, MAX_HEADER_VALUE_CHARS)}…[truncated]`
          : value;
    }
  }
  return out;
}

/**
 * Redact a URL for evidence: strips userinfo and drops the entire query
 * string and fragment (query parameters routinely carry session ids and
 * tokens). Returns a fixed placeholder when the input is not a parseable
 * absolute URL.
 */
export function redactUrlValue(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return `${REACTED_URL_PLACEHOLDER}`;
  }
  const port = url.port === "" ? "" : `:${url.port}`;
  const path = url.pathname.slice(0, 1024);
  return `${url.protocol}//${url.hostname}${port}${path}`;
}

const REACTED_URL_PLACEHOLDER = "[REDACTED-URL]" as const;

export interface RedactObjectOptions {
  /** Extra key names treated as sensitive (never shrinks the built-in set). */
  readonly extraSensitiveKeys?: readonly string[];
  /** Recursion depth cap (default 8); deeper values become `[REDACTED]`. */
  readonly maxDepth?: number;
  /** Per-string bound passed to {@link redactText} (default 4096). */
  readonly maxStringChars?: number;
}

/**
 * Deep-redact an arbitrary JSON-shaped value: sensitive keys → `[REDACTED]`,
 * strings → {@link redactText}, arrays/objects walked recursively. Circular
 * structures and non-plain objects (which may hide secrets in exotic fields)
 * degrade to safe placeholders. Always returns a new value.
 */
export function redactValue<T>(input: T, options: RedactObjectOptions = {}): T {
  const maxDepth = options.maxDepth ?? 8;
  const maxStringChars = options.maxStringChars ?? 4096;
  const extraKeys = new Set((options.extraSensitiveKeys ?? []).map((k) => k.toLowerCase()));
  const seen = new WeakSet<object>();

  const walk = (value: unknown, depth: number): unknown => {
    if (value === null || value === undefined) return value;
    if (typeof value === "string") return redactText(value, maxStringChars);
    if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
      return value;
    }
    if (typeof value !== "object") return REDACTED_VALUE;
    if (depth > maxDepth) return REDACTED_VALUE;
    if (seen.has(value)) return "[CIRCULAR]";
    seen.add(value);

    if (Array.isArray(value)) {
      return value.map((v) => walk(v, depth + 1));
    }

    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      // Dates, Maps, Buffers, class instances — opaque, may hold secrets.
      return REDACTED_VALUE;
    }

    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(key) || extraKeys.has(key.toLowerCase())) {
        out[key] = REDACTED_VALUE;
      } else {
        out[key] = walk(v, depth + 1);
      }
    }
    return out;
  };

  return walk(input, 0) as T;
}

/**
 * Redact model-produced text (proposals, objectives, log artifacts) before
 * persistence — model output is untrusted and may smuggle credentials or
 * prompt-echoed secrets.
 */
export function redactModelText(text: string, maxChars = 2000): string {
  return redactText(text, maxChars);
}
