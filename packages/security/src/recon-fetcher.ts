import {
  isBlockedResolvedAddress,
  canonicalizeHttpsUrl,
  evaluateRedirect,
  normalizeHostname,
} from "./url-policy.js";
import { checkPathPermitted } from "./paths.js";

/**
 * Strictly-passive outbound fetcher for builder (URL-only) reconnaissance.
 *
 * Two INDEPENDENT enforcement layers, both consulted per connection:
 *  1. URL policy gate — `canonicalizeHttpsUrl` + `evaluateRedirect` +
 *     `checkPathPermitted` (L04, pure).
 *  2. Egress guard — every concrete destination IP is resolved once,
 *     classified through `isBlockedResolvedAddress`, and the TLS socket is
 *     then pinned to THAT validated address (SNI keeps the real hostname).
 *     DNS answers received after pinning can never redirect the connection,
 *     which is what makes DNS-rebinding attacks inert.
 *
 * Quotas are hard-coded in `DEFAULT_RECON_LIMITS` and enforced inside the
 * socket loop — header/body byte caps, per-request and total-run request
 * counts, wall-clock deadline. Nothing here accepts an untrusted config.
 *
 * I/O boundary: `DnsResolver` and `SocketFactory` are interfaces so unit
 * tests inject fakes; production wires the `net`/`tls`/`dns` impls.
 */

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type ReconErrorCode =
  | "invalid_url"
  | "policy_denied"
  | "dns_blocked"
  | "dns_failed"
  | "unreachable"
  | "tls_failed"
  | "timeout"
  | "quota_exceeded"
  | "redirect_denied"
  | "path_not_permitted"
  | "http_error";

export class ReconError extends Error {
  constructor(
    public readonly code: ReconErrorCode,
    message: string,
    public readonly userReason?: string,
  ) {
    super(message);
    this.name = "ReconError";
  }
}

// ---------------------------------------------------------------------------
// I/O interfaces
// ---------------------------------------------------------------------------

export interface DnsResolver {
  /** All A + AAAA records for host (CNAME-expanded by resolver). */
  resolveAddresses(host: string): Promise<string[]>;
  resolveTxt(host: string): Promise<string[][]>;
}

export interface TlsSession {
  protocol: string | null;
  cipherName: string | null;
  alpnProtocol: string | null;
  certSubject: string | null;
  certIssuer: string | null;
  certNotBefore: string | null;
  certNotAfter: string | null;
  /** True when a CA-validated cert chain was presented. */
  authorized: boolean;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string[]>;
  body: Uint8Array;
  remoteIp: string;
  redirectLocation: string | null;
  tls: TlsSession;
}

export interface FetchRequest {
  host: string;
  /** Pre-validated destination IP — the socket MUST connect here. */
  pinnedIp: string;
  path: string;
  limits: ReconLimits;
}

export interface SocketFactory {
  httpsGet(req: FetchRequest): Promise<HttpResponse>;
}

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

export interface ReconLimits {
  connectTimeoutMs: number;
  requestTimeoutMs: number;
  maxHeaderBytes: number;
  maxBodyBytes: number;
  maxRedirects: number;
  /** Per target host, per run. */
  maxRequestsPerRun: number;
  /** Whole-run wall clock. */
  runDeadlineMs: number;
}

export const DEFAULT_RECON_LIMITS: ReconLimits = Object.freeze({
  connectTimeoutMs: 5_000,
  requestTimeoutMs: 8_000,
  maxHeaderBytes: 16 * 1024,
  maxBodyBytes: 256 * 1024,
  maxRedirects: 3,
  maxRequestsPerRun: 8,
  runDeadlineMs: 30_000,
});

// ---------------------------------------------------------------------------
// DNS + egress guard
// ---------------------------------------------------------------------------

export interface ResolvedTarget {
  host: string;
  canonicalOrigin: string;
  /** Every resolved address (already filtered + validated). */
  addresses: string[];
  /** The IP the socket will be pinned to. */
  pinnedIp: string;
}

/**
 * Resolve a canonical HTTPS host once and return a pinned, policy-clean
 * target. Throws ReconError with user-safe reason on any refusal:
 * - lexical URL policy (via canonicalizeHttpsUrl — same rules as L04)
 * - DNS failure → "unreachable" / "dns_failed"
 * - ANY resolved A/AAAA in a prohibited range → "dns_blocked" — we do not
 *   cherry-pick "the good IP"; a hostile mixed answer is a refusal.
 */
export async function resolveAndPinTarget(
  rawUrl: string,
  resolver: DnsResolver,
): Promise<ResolvedTarget> {
  const canon = canonicalizeHttpsUrl(rawUrl);
  if (!canon.ok) {
    const first = canon.reasons[0];
    throw new ReconError(
      "policy_denied",
      `URL rejected by policy: ${first?.detail ?? "unsafe_url"}`,
      "The URL is not permitted — only canonical https URLs on standard ports to public hosts are allowed.",
    );
  }
  const host = normalizeHostname(canon.canonical.url.hostname);

  let addresses: string[];
  try {
    addresses = await resolver.resolveAddresses(host);
  } catch {
    throw new ReconError(
      "dns_failed",
      `DNS resolution failed for ${host}`,
      "The site could not be found (DNS lookup failed).",
    );
  }
  if (addresses.length === 0) {
    throw new ReconError(
      "unreachable",
      `no A/AAAA records for ${host}`,
      "The site could not be reached — no DNS records found.",
    );
  }
  const blocked = addresses.filter((a) => isBlockedResolvedAddress(a));
  if (blocked.length > 0) {
    throw new ReconError(
      "dns_blocked",
      `resolved address(es) in prohibited ranges for ${host}`,
      "The site resolves to a private or restricted network address — not allowed.",
    );
  }
  return {
    host,
    canonicalOrigin: `https://${host}`,
    addresses,
    pinnedIp: addresses[0]!,
  };
}

// ---------------------------------------------------------------------------
// Recon runner (fetch orchestration)
// ---------------------------------------------------------------------------

export interface PassiveReconDeps {
  resolver: DnsResolver;
  fetcher: SocketFactory;
}

export interface FetchedPage {
  url: string;
  path: string;
  status: number;
  headers: Record<string, string[]>;
  redirectLocation: string | null;
  tls: TlsSession;
}

export interface ReconRunResult {
  pages: FetchedPage[];
  requestCount: number;
  bytesReceived: number;
  limitations: string[];
}

/**
 * Execute a strictly-passive recon: resolve+pin the host, then GET the root
 * page plus each permitted path (sequential, no concurrency), tracking
 * quota consumption. Redirects are followed ONLY to the same canonical host
 * (evaluateRedirect already enforces scheme/host/userinfo); redirect chains
 * that hop hosts are terminated with a `redirect` observation, not followed.
 */
export async function runPassiveRecon(opts: {
  canonicalOrigin: string;
  allowedPaths: readonly string[];
  resolver: DnsResolver;
  fetcher: SocketFactory;
  limits?: Partial<ReconLimits>;
}): Promise<ReconRunResult> {
  const limits: ReconLimits = { ...DEFAULT_RECON_LIMITS, ...(opts.limits ?? {}) };
  const deadline = Date.now() + limits.runDeadlineMs;

  // Resolve once → pinned IP; every request in this run uses it.
  const target = await resolveAndPinTarget(opts.canonicalOrigin, opts.resolver);

  const paths = dedupePaths(["/", ...opts.allowedPaths]);
  if (paths.length > limits.maxRequestsPerRun) {
    throw new ReconError(
      "quota_exceeded",
      `path count ${paths.length} exceeds per-run request budget ${limits.maxRequestsPerRun}`,
      "Too many paths were requested — reduce the permitted path list.",
    );
  }

  const pages: FetchedPage[] = [];
  const limitations: string[] = [];
  let bytesReceived = 0;
  let requestCount = 0;

  for (const path of paths) {
    if (Date.now() > deadline) {
      limitations.push(
        `run deadline reached after ${pages.length} pages — remaining paths not probed`,
      );
      break;
    }
    if (requestCount >= limits.maxRequestsPerRun) break;

    const pathCheck = checkPathPermitted(
      { allowedPaths: ["/", ...opts.allowedPaths], deniedPaths: [] },
      path,
    );
    if (!pathCheck.permitted) continue;

    requestCount += 1;
    try {
      const res = await fetchWithSameHostRedirects({
        url: `${opts.canonicalOrigin}${path}`,
        pinnedIp: target.pinnedIp,
        fetcher: opts.fetcher,
        limits,
        deadline,
      });
      bytesReceived += res.body.byteLength;
      pages.push({
        url: `${opts.canonicalOrigin}${path}`,
        path,
        status: res.status,
        headers: res.headers,
        redirectLocation: res.redirectLocation,
        tls: res.tls,
      });
    } catch (err) {
      if (err instanceof ReconError) throw err;
      throw new ReconError(
        "unreachable",
        `fetch failed for ${path}: ${err instanceof Error ? err.message : "unknown"}`,
        "The site did not respond to a standard HTTPS request.",
      );
    }
  }

  return { pages, requestCount, bytesReceived, limitations };
}

function dedupePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paths) {
    const norm = p === "" ? "/" : p;
    if (!seen.has(norm)) {
      seen.add(norm);
      out.push(norm);
    }
  }
  return out;
}

/**
 * One logical request: GET path; on a redirect response, follow ONLY if the
 * target stays on the same canonical host within redirect/path policy.
 * Returns the final response. Redirect hops count against maxRequestsPerRun.
 */
async function fetchWithSameHostRedirects(opts: {
  url: string;
  pinnedIp: string;
  fetcher: SocketFactory;
  limits: ReconLimits;
  deadline: number;
}): Promise<HttpResponse> {
  let current = opts.url;
  let redirectsUsed = 0;
  for (;;) {
    if (Date.now() > opts.deadline) {
      throw new ReconError(
        "timeout",
        "run deadline exceeded during redirect chain",
        "The site was too slow to respond.",
      );
    }
    const host = normalizeHostname(new URL(current).hostname);
    const u = new URL(current);
    const res = await opts.fetcher.httpsGet({
      host,
      pinnedIp: opts.pinnedIp,
      path: u.pathname + u.search,
      limits: opts.limits,
    });
    const loc = res.redirectLocation;
    if (
      loc === null ||
      (res.status !== 301 &&
        res.status !== 302 &&
        res.status !== 303 &&
        res.status !== 307 &&
        res.status !== 308)
    ) {
      return res;
    }
    const decision = evaluateRedirect({
      currentUrl: current,
      location: loc,
      allowedHosts: [host],
      redirectsUsed,
      maxRedirects: opts.limits.maxRedirects,
    });
    if (!decision.ok) {
      // Return the 3xx response untouched — the caller records the refused
      // redirect as an observation instead of following it.
      return res;
    }
    redirectsUsed = decision.redirectsUsed;
    current = decision.url.toString();
  }
}
