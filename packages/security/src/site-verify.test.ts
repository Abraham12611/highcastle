import { describe, expect, it } from "vitest";
import {
  DNS_RECORD_PREFIX,
  verifyDnsTxt,
  verifyWellKnown,
  type VerificationChallenge,
} from "./site-verify.js";
import type { DnsResolver, HttpResponse, SocketFactory } from "./recon-fetcher.js";

const challenge: VerificationChallenge = {
  token: "hc-verify=abc123",
  expiresAt: new Date(Date.now() + 3600_000),
  dnsRecordName: `${DNS_RECORD_PREFIX}.site.test`,
  dnsTxtValue: "hc-verify=abc123",
  wellKnownUrl: "https://site.test/.well-known/highcastle-verification.txt",
  wellKnownExpectedBody: "hc-verify=abc123",
};

function resolver(txt: Record<string, string[][]>): DnsResolver {
  return {
    resolveAddresses: async () => ["93.184.216.34"],
    resolveTxt: async (h) => {
      if (h in txt) return txt[h]!;
      throw new Error("ENODATA");
    },
  };
}

function bodyResponse(body: string, status = 200): HttpResponse {
  return {
    status,
    headers: {},
    body: new TextEncoder().encode(body),
    remoteIp: "93.184.216.34",
    redirectLocation: null,
    tls: {
      protocol: "TLSv1.3",
      cipherName: null,
      alpnProtocol: null,
      certSubject: null,
      certIssuer: null,
      certNotBefore: null,
      certNotAfter: null,
      authorized: true,
    },
  };
}

describe("verifyDnsTxt", () => {
  it("accepts the matching token (joined chunks)", async () => {
    const r = resolver({ [challenge.dnsRecordName]: [["hc-verify=", "abc123"]] });
    expect(await verifyDnsTxt(challenge, r)).toEqual({ ok: true });
  });

  it("rejects a mismatched token — no spoofed acceptance", async () => {
    const r = resolver({ [challenge.dnsRecordName]: [["hc-verify=WRONG"]] });
    const out = await verifyDnsTxt(challenge, r);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe("token_mismatch");
  });

  it("reports dns_failed (user-safe) when the record is absent", async () => {
    const out = await verifyDnsTxt(challenge, resolver({}));
    expect(out).toMatchObject({ ok: false, code: "dns_failed" });
  });
});

describe("verifyWellKnown", () => {
  const res = resolver({});
  const fetcher = (body: string, status = 200): SocketFactory => ({
    httpsGet: async () => bodyResponse(body, status),
  });

  it("accepts the exact expected body through the pinned fetcher", async () => {
    expect(await verifyWellKnown(challenge, res, fetcher("hc-verify=abc123\n"))).toEqual({
      ok: true,
    });
  });

  it("rejects wrong body and non-200", async () => {
    expect(await verifyWellKnown(challenge, res, fetcher("hc-verify=other"))).toMatchObject({
      ok: false,
      code: "token_mismatch",
    });
    expect(await verifyWellKnown(challenge, res, fetcher("hc-verify=abc123", 404))).toMatchObject({
      ok: false,
      code: "http_error",
    });
  });
});
