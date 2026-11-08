import { randomBytes } from "node:crypto";
import type { DnsResolver, SocketFactory, ReconLimits } from "./recon-fetcher.js";
import { ReconError, DEFAULT_RECON_LIMITS, resolveAndPinTarget } from "./recon-fetcher.js";

/**
 * Owned-site control verification for the builder pathway.
 *
 * Two methods, both proving control of the same host:
 *  - "dns-txt"    → TXT `_highcastle-verification.<host>` carries `hc-verify=<token>`
 *  - "well-known" → GET `https://<host>/.well-known/highcastle-verification.txt`
 *                   body equals `hc-verify=<token>` (through the SAME pinned,
 *                   policy-gated fetcher as recon — verification never gets a
 *                   weaker network path than the tests it authorizes).
 *
 * Deliberate limitation, stated up front: control of a subdomain/site does
 * NOT grant license for intrusive testing of shared hosting platforms —
 * verification only unlocks strictly passive metadata checks.
 */

export const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24h challenge window
export const WELL_KNOWN_PATH = "/.well-known/highcastle-verification.txt";
export const DNS_RECORD_PREFIX = "_highcastle-verification";

export interface VerificationChallenge {
  token: string;
  expiresAt: Date;
  dnsRecordName: string;
  dnsTxtValue: string;
  wellKnownUrl: string;
  wellKnownExpectedBody: string;
}

export function newVerificationChallenge(
  canonicalOrigin: string,
  now = new Date(),
): VerificationChallenge {
  const host = new URL(canonicalOrigin).hostname;
  const token = `hc-verify=${randomBytes(24).toString("hex")}`;
  return {
    token,
    expiresAt: new Date(now.getTime() + VERIFICATION_TTL_MS),
    dnsRecordName: `${DNS_RECORD_PREFIX}.${host}`,
    dnsTxtValue: token,
    wellKnownUrl: `${canonicalOrigin}${WELL_KNOWN_PATH}`,
    wellKnownExpectedBody: token,
  };
}

export type VerifyOutcome =
  { ok: true } | { ok: false; code: ReconError["code"] | "token_mismatch"; reason: string };

/** DNS TXT check. Token may appear in any TXT record on the record name
 * (joined chunks). NXDOMAIN/other DNS errors → unreachable, not "failed". */
export async function verifyDnsTxt(
  challenge: VerificationChallenge,
  resolver: DnsResolver,
): Promise<VerifyOutcome> {
  let records: string[][];
  try {
    records = await resolver.resolveTxt(challenge.dnsRecordName);
  } catch {
    return {
      ok: false,
      code: "dns_failed",
      reason: "Could not read the DNS record — check it is published, then retry.",
    };
  }
  const found = records.some((chunks) => chunks.join("") === challenge.dnsTxtValue);
  return found
    ? { ok: true }
    : {
        ok: false,
        code: "token_mismatch",
        reason: "DNS record found but the value did not match the verification token.",
      };
}

/** Well-known file check through the pinned fetcher — body must equal the
 * token exactly (bounded 256B read, no redirects followed cross-host). */
export async function verifyWellKnown(
  challenge: VerificationChallenge,
  resolver: DnsResolver,
  fetcher: SocketFactory,
  limits: ReconLimits = DEFAULT_RECON_LIMITS,
): Promise<VerifyOutcome> {
  try {
    const target = await resolveAndPinTarget(challenge.wellKnownUrl, resolver);
    const res = await fetcher.httpsGet({
      host: target.host,
      pinnedIp: target.pinnedIp,
      path: WELL_KNOWN_PATH,
      limits: { ...limits, maxBodyBytes: 1024, maxRedirects: 0 },
    });
    const body = new TextDecoder().decode(res.body).trim();
    if (res.status !== 200) {
      return {
        ok: false,
        code: "http_error",
        reason: `The verification file returned HTTP ${res.status} — expected 200.`,
      };
    }
    return body === challenge.wellKnownExpectedBody
      ? { ok: true }
      : {
          ok: false,
          code: "token_mismatch",
          reason: "The verification file was found but its content did not match the token.",
        };
  } catch (err) {
    if (err instanceof ReconError) {
      return {
        ok: false,
        code: err.code,
        reason: err.userReason ?? "Verification request failed.",
      };
    }
    return {
      ok: false,
      code: "unreachable",
      reason: "The site could not be reached for verification.",
    };
  }
}
