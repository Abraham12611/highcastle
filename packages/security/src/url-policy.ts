import { denyReason, type PolicyDenyReason } from "./decisions.js";
import { checkPathPermitted } from "./paths.js";
import { deepFreeze } from "./freeze.js";

/**
 * Threat-bearing URL policy (security/02 §"Threat-bearing URL handling").
 *
 * Layered model:
 * 1. `assertSafeHostname` — lexical host safety: rejects every IP-literal
 *    spelling (dotted/short/octal/hex/integer IPv4, bracketed or bare IPv6,
 *    IPv4-mapped forms), wildcard and well-known local/metadata names.
 * 2. `isBlockedResolvedAddress` — post-DNS defense in depth: classifies a
 *    resolved IP against loopback/private/link-local/metadata/CGNAT/
 *    multicast/reserved ranges so DNS-rebinding and CNAME-collapses deny.
 * 3. `canonicalizeHttpsUrl` — scheme/port/userinfo normalization; HTTPS only.
 * 4. `evaluateRedirect` — every 3xx target is re-checked against all of the
 *    above plus the authorized scope before it may be followed.
 *
 * For H the executable runner never consumes a URL at all (fixed `target-lab`
 * alias); this layer exists for scope host validation now and for validated
 * target handlers later. It never performs I/O — DNS answers are classified
 * by the caller passing them to `isBlockedResolvedAddress`.
 */

// ---------------------------------------------------------------------------
// Hostname classification
// ---------------------------------------------------------------------------

/** One IPv4 address part in any notation: decimal (incl. octal-leading-zero) or hex. */
const IPV4_NUMERIC_PART = /^(?:\d+|0x[0-9a-f]+)$/i;

/**
 * True when `host` is an IP literal in ANY spelling: "127.0.0.1", "127.1",
 * "0177.0.0.1", "0x7f000001", "0x7f.1", "2130706433", "::1", "[::1]",
 * "::ffff:7f00:1", "0:0:0:0:0:ffff:127.0.0.1".
 */
export function isIpLiteralHost(host: string): boolean {
  let h = host.trim().toLowerCase();
  if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1);
  if (h.includes(":")) return true; // every IPv6 spelling
  if (h === "" || !/^[0-9a-fx.]+$/.test(h)) return false;
  const parts = h.split(".");
  return parts.every((p) => IPV4_NUMERIC_PART.test(p));
}

/** Names that must never resolve to an executable target. */
const BLOCKED_HOST_EXACT = new Set([
  "localhost",
  "metadata", // GCP short name
  "instance-data", // AWS metadata hostname
  "metadata.google.internal",
  "host.docker.internal",
  "gateway.docker.internal",
  "kubernetes.docker.internal",
]);

const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".localdomain",
  ".internal.host",
  ".docker.internal",
  ".metadata.google.internal",
];

export function normalizeHostname(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, "");
}

export function isDangerousHostname(host: string): boolean {
  const h = normalizeHostname(host);
  if (h === "" || h.length > 253) return true;
  if (h.includes("*")) return true; // wildcard is not a host
  if (isIpLiteralHost(h)) return true;
  if (BLOCKED_HOST_EXACT.has(h)) return true;
  return BLOCKED_HOST_SUFFIXES.some((s) => h.endsWith(s));
}

export function assertSafeHostname(host: string): PolicyDenyReason[] {
  if (isDangerousHostname(host)) {
    return [
      denyReason(
        "unsafe_hostname",
        `hostname ${JSON.stringify(host.slice(0, 120))} is an IP literal, local or metadata destination`,
      ),
    ];
  }
  return [];
}

/**
 * True when `host` is inside the scope's `allowedHosts` — case-insensitive,
 * trailing-dot-normalized, EXACT match only. Subdomains are deliberately
 * not implied by an allowed parent: `example.com` does not cover
 * `evil.example.com`.
 */
export function isHostInScope(host: string, allowedHosts: readonly string[]): boolean {
  const h = normalizeHostname(host);
  return allowedHosts.some((allowed) => normalizeHostname(allowed) === h);
}

// ---------------------------------------------------------------------------
// Resolved-address classification (defense in depth)
// ---------------------------------------------------------------------------

interface Ipv4Range {
  base: number; // dotted quad as uint32
  bits: number; // prefix length
}

const BLOCKED_IPV4_RANGES: readonly Ipv4Range[] = [
  { base: 0x00000000, bits: 8 }, // 0.0.0.0/8 "this network"
  { base: 0x0a000000, bits: 8 }, // 10.0.0.0/8 private
  { base: 0x64400000, bits: 10 }, // 100.64.0.0/10 CGNAT
  { base: 0x7f000000, bits: 8 }, // 127.0.0.0/8 loopback
  { base: 0xa9fe0000, bits: 16 }, // 169.254.0.0/16 link-local + cloud metadata
  { base: 0xac100000, bits: 12 }, // 172.16.0.0/12 private
  { base: 0xc0000000, bits: 24 }, // 192.0.0.0/24 IETF protocol assignments
  { base: 0xc0000200, bits: 24 }, // 192.0.2.0/24 TEST-NET-1
  { base: 0xc0a80000, bits: 16 }, // 192.168.0.0/16 private
  { base: 0xc6120000, bits: 15 }, // 198.18.0.0/15 benchmarking
  { base: 0xc6336400, bits: 24 }, // 198.51.100.0/24 TEST-NET-2
  { base: 0xcb007100, bits: 24 }, // 203.0.113.0/24 TEST-NET-3
  { base: 0xe0000000, bits: 4 }, // 224.0.0.0/4 multicast
  { base: 0xf0000000, bits: 4 }, // 240.0.0.0/4 reserved + broadcast
];

function parseIpv4(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    // Reject >255 and non-canonical spellings ("007", "01") outright —
    // alternate IPv4 notations are refused before they reach here anyway.
    if (n > 255 || p !== String(n)) return null;
    value = value * 256 + n;
  }
  return value >>> 0;
}

/** Expand an IPv6 string to its 16 bytes; null when unparseable. */
function parseIpv6(ip: string): number[] | null {
  let h = ip.toLowerCase();
  if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1);

  // IPv4-mapped tail, e.g. ::ffff:127.0.0.1
  const lastColon = h.lastIndexOf(":");
  const tail = lastColon >= 0 ? h.slice(lastColon + 1) : h;
  let v4Tail: number | null = null;
  if (tail.includes(".")) {
    v4Tail = parseIpv4(tail);
    if (v4Tail === null) return null;
    h = `${h.slice(0, lastColon)}:${((v4Tail >>> 16) & 0xffff).toString(16)}:${(v4Tail & 0xffff).toString(16)}`;
  }

  const halves = h.split("::");
  if (halves.length > 2) return null;
  const left = (halves[0] ?? "").split(":").filter((s) => s !== "");
  const right = halves.length === 2 ? (halves[1] ?? "").split(":").filter((s) => s !== "") : [];
  if (halves.length === 1 && left.length !== 8) return null;
  const missing = 8 - left.length - right.length;
  if (missing < 0) return null;
  const groups = [...left, ...new Array<string>(missing).fill("0"), ...right];
  if (groups.length !== 8) return null;
  const bytes: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    const n = parseInt(g, 16);
    bytes.push(n >> 8, n & 0xff);
  }
  return bytes;
}

function ipv4Blocked(value: number): boolean {
  return BLOCKED_IPV4_RANGES.some(
    ({ base, bits }) => value >>> (32 - bits) === base >>> (32 - bits),
  );
}

/**
 * Classifies a *resolved* destination address. True = blocked: loopback,
 * RFC1918 private, link-local/cloud-metadata, CGNAT, multicast, reserved,
 * documentation ranges, IPv6 equivalents (::1, fc00::/7, fe80::/10,
 * ff00::/8, ::, 2001:db8::/32) and IPv4-mapped IPv6 forms.
 *
 * Use for post-DNS / DNS-rebinding checks on non-lab targets. The H demo
 * lab is reached through the fixed service alias on an isolated network and
 * never passes through this check — do not apply it to `target-lab`.
 */
export function isBlockedResolvedAddress(ip: string): boolean {
  const v4 = parseIpv4(ip);
  if (v4 !== null) return ipv4Blocked(v4);

  const v6 = parseIpv6(ip);
  if (v6 === null) return true; // unparseable → fail closed

  // :: (unspecified) and ::1 (loopback)
  if (v6.every((b) => b === 0)) return true;
  if (v6.slice(0, 15).every((b) => b === 0) && v6[15] === 1) return true;

  // ::ffff:0:0/96 IPv4-mapped → classify as IPv4
  if (v6.slice(0, 10).every((b) => b === 0) && v6[10] === 0xff && v6[11] === 0xff) {
    const mapped = ((v6[12]! << 24) | (v6[13]! << 16) | (v6[14]! << 8) | v6[15]!) >>> 0;
    return ipv4Blocked(mapped);
  }

  const first = v6[0]!;
  // fe80::/10 link-local
  if (first === 0xfe && (v6[1]! & 0xc0) === 0x80) return true;
  // fc00::/7 unique-local
  if ((first & 0xfe) === 0xfc) return true;
  // ff00::/8 multicast
  if (first === 0xff) return true;
  // 2001:db8::/32 documentation
  if (first === 0x20 && v6[1] === 0x01 && v6[2] === 0x0d && v6[3] === 0xb8) {
    return true;
  }
  // 64:ff9b::/96 NAT64 well-known prefix — treat with the mapped-v4 rules
  if (first === 0x00 && v6[1] === 0x64 && v6[2] === 0xff && v6[3] === 0x9b) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// URL canonicalization
// ---------------------------------------------------------------------------

export interface CanonicalUrl {
  url: URL;
  /** `https://host/path` — scheme+host normalized, default port removed. */
  normalizedOrigin: string;
}

export type CanonicalizeResult =
  { ok: true; canonical: CanonicalUrl } | { ok: false; reasons: PolicyDenyReason[] };

/**
 * Parse and normalize an HTTPS target URL. Denies: unparseable input,
 * non-https schemes (http/file/data/javascript/custom), credentials in
 * userinfo, non-default ports, and every unsafe hostname class above.
 * URL query strings can never override host/port — they are preserved only
 * in `url` for the caller to strip before logging.
 */
export function canonicalizeHttpsUrl(raw: string): CanonicalizeResult {
  const reasons: PolicyDenyReason[] = [];

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return {
      ok: false,
      reasons: [denyReason("unsafe_url", "target is not a parseable absolute URL")],
    };
  }

  if (url.protocol !== "https:") {
    reasons.push(
      denyReason("unsafe_scheme", `scheme ${JSON.stringify(url.protocol)} is not https`),
    );
  }
  if (url.username !== "" || url.password !== "") {
    reasons.push(
      denyReason("unsafe_credentials_in_url", "credentials in URL userinfo are never permitted"),
    );
  }
  const port = url.port;
  if (port !== "" && port !== "443") {
    reasons.push(denyReason("unsafe_port", `port ${JSON.stringify(port)} is not 443`));
  }
  reasons.push(...assertSafeHostname(url.hostname));

  if (reasons.length > 0) return { ok: false, reasons };
  return deepFreeze({
    ok: true as const,
    canonical: {
      url,
      normalizedOrigin: `${url.protocol}//${url.hostname}`,
    },
  });
}

// ---------------------------------------------------------------------------
// Redirect evaluation
// ---------------------------------------------------------------------------

export const MAX_REDIRECTS = 3 as const;

export interface RedirectCheckInput {
  /** Absolute https URL of the request that produced the redirect. */
  currentUrl: string;
  /** Raw `Location` header value (may be relative). */
  location: string;
  /** Scope-approved hostnames (exact match after normalization). */
  allowedHosts: readonly string[];
  /** Optional scope path policy applied to the redirect target. */
  allowedPaths?: readonly string[];
  deniedPaths?: readonly string[];
  /** Redirects already followed for this request (default 0). */
  redirectsUsed?: number;
  /** Hard cap on total redirects (default MAX_REDIRECTS). */
  maxRedirects?: number;
}

export type RedirectDecision =
  { ok: true; url: URL; redirectsUsed: number } | { ok: false; reasons: PolicyDenyReason[] };

/**
 * Re-check a redirect before it may be followed. A redirect may NEVER change
 * scheme (https→http), hop to a host outside `allowedHosts`, introduce
 * userinfo, or escape path scope — even to a "safe-looking" URL, because the
 * location header is attacker-controlled content from the target.
 */
export function evaluateRedirect(input: RedirectCheckInput): RedirectDecision {
  const reasons: PolicyDenyReason[] = [];
  const used = input.redirectsUsed ?? 0;
  const max = input.maxRedirects ?? MAX_REDIRECTS;

  if (used + 1 > max) {
    return {
      ok: false,
      reasons: [denyReason("redirect_limit_exceeded", `redirect chain exceeds ${max} hops`)],
    };
  }

  let current: URL;
  try {
    current = new URL(input.currentUrl);
  } catch {
    return {
      ok: false,
      reasons: [denyReason("unsafe_url", "current URL is not a parseable absolute URL")],
    };
  }

  let next: URL;
  try {
    next = new URL(input.location, current);
  } catch {
    return {
      ok: false,
      reasons: [denyReason("unsafe_url", "redirect location is not a parseable URL")],
    };
  }

  if (next.protocol !== "https:" || next.protocol !== current.protocol) {
    reasons.push(
      denyReason(
        "unsafe_scheme",
        `redirect to ${JSON.stringify(next.protocol)} changes or lowers the scheme`,
      ),
    );
  }
  if (next.username !== "" || next.password !== "") {
    reasons.push(
      denyReason("unsafe_credentials_in_url", "redirect carries credentials in userinfo"),
    );
  }
  if (next.port !== "" && next.port !== "443") {
    reasons.push(
      denyReason("unsafe_port", `redirect port ${JSON.stringify(next.port)} is not 443`),
    );
  }
  reasons.push(...assertSafeHostname(next.hostname));

  if (reasons.length === 0 && !isHostInScope(next.hostname, input.allowedHosts)) {
    reasons.push(
      denyReason("redirect_target_denied", "redirect target host is outside the authorized scope"),
    );
  }

  if (
    reasons.length === 0 &&
    (input.allowedPaths !== undefined || input.deniedPaths !== undefined)
  ) {
    const pathCheck = checkPathPermitted(
      {
        allowedPaths: input.allowedPaths ?? [],
        deniedPaths: input.deniedPaths ?? [],
      },
      next.pathname,
    );
    if (!pathCheck.permitted && pathCheck.reason !== null) {
      reasons.push(pathCheck.reason);
    }
  }

  if (reasons.length > 0) return { ok: false, reasons };
  return deepFreeze({ ok: true as const, url: next, redirectsUsed: used + 1 });
}

// ---------------------------------------------------------------------------
// Full URL-in-scope check (scope host + path + safety, one call)
// ---------------------------------------------------------------------------

export function checkUrlAllowed(
  rawUrl: string,
  scope: {
    allowedHosts: readonly string[];
    allowedPaths: readonly string[];
    deniedPaths: readonly string[];
  },
): PolicyDenyReason[] {
  const reasons: PolicyDenyReason[] = [];

  const canonical = canonicalizeHttpsUrl(rawUrl);
  if (!canonical.ok) return canonical.reasons;

  const { url } = canonical.canonical;
  if (!isHostInScope(url.hostname, scope.allowedHosts)) {
    reasons.push(
      denyReason(
        "host_out_of_scope",
        `host ${JSON.stringify(url.hostname)} is not in the authorized host scope`,
      ),
    );
  }
  const pathCheck = checkPathPermitted(scope, url.pathname);
  if (!pathCheck.permitted && pathCheck.reason !== null) {
    reasons.push(pathCheck.reason);
  }
  return reasons;
}
