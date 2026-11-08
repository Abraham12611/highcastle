import { describe, expect, it } from "vitest";
import {
  ReconError,
  resolveAndPinTarget,
  runPassiveRecon,
  type DnsResolver,
  type FetchRequest,
  type HttpResponse,
  type SocketFactory,
} from "./recon-fetcher.js";

/**
 * Adversarial coverage for the egress layers: SSRF targets, DNS rebinding,
 * redirect escapes, response spoofing and quota exhaustion — all through
 * fake I/O, no network.
 */

function resolverWith(
  map: Record<string, string[]>,
  txt: Record<string, string[][]> = {},
): DnsResolver {
  return {
    resolveAddresses: async (host) => {
      if (host in map) return map[host]!;
      throw new Error("ENOTFOUND");
    },
    resolveTxt: async (host) => {
      if (host in txt) return txt[host]!;
      throw new Error("ENODATA");
    },
  };
}

function page(status = 200, headers: Record<string, string[]> = {}): HttpResponse {
  return {
    status,
    headers,
    body: new Uint8Array(8),
    remoteIp: "93.184.216.34",
    redirectLocation: headers["location"]?.[0] ?? null,
    tls: {
      protocol: "TLSv1.3",
      cipherName: "TLS_AES_128_GCM_SHA256",
      alpnProtocol: "http/1.1",
      certSubject: "site.test",
      certIssuer: "Test CA",
      certNotBefore: "2025-01-01",
      certNotAfter: "2030-01-01",
      authorized: true,
    },
  };
}

function recorder(pages: HttpResponse[] | ((req: FetchRequest, n: number) => HttpResponse)) {
  const calls: FetchRequest[] = [];
  const factory: SocketFactory = {
    httpsGet: async (req) => {
      calls.push(req);
      if (typeof pages === "function") return pages(req, calls.length - 1);
      const p = pages[calls.length - 1];
      if (!p) throw new ReconError("unreachable", "no page");
      return p;
    },
  };
  return { calls, factory };
}

const ORIGIN = "https://site.test";

describe("resolveAndPinTarget — SSRF / rebinding", () => {
  it("rejects private/loopback/link-local/metadata A records", async () => {
    for (const ip of [
      "10.0.0.4",
      "127.0.0.1",
      "169.254.169.254",
      "192.168.1.1",
      "172.16.5.5",
      "100.64.0.1",
    ]) {
      await expect(
        resolveAndPinTarget(ORIGIN, resolverWith({ "site.test": [ip] })),
      ).rejects.toMatchObject({ code: "dns_blocked" });
    }
  });

  it("rejects mixed answers containing one prohibited IP (rebinding collapse)", async () => {
    await expect(
      resolveAndPinTarget(
        ORIGIN,
        resolverWith({ "site.test": ["93.184.216.34", "169.254.169.254"] }),
      ),
    ).rejects.toMatchObject({ code: "dns_blocked" });
  });

  it("rejects prohibited IPv6 (ULA, link-local, mapped-v4, Teredo)", async () => {
    for (const ip of ["fd00::1", "fe80::1", "::ffff:127.0.0.1", "2001:0::1"]) {
      await expect(
        resolveAndPinTarget(ORIGIN, resolverWith({ "site.test": [ip] })),
      ).rejects.toMatchObject({ code: "dns_blocked" });
    }
  });

  it("rejects IP-literal, userinfo, non-443 ports and non-https schemes", async () => {
    for (const url of [
      "https://127.0.0.1/",
      "https://user:pw@site.test/",
      "https://site.test:8443/",
      "ftp://site.test/",
      "https://localhost/",
      "not-a-url",
      "https://metadata.google.internal/",
      "https://169.254.169.254/",
    ]) {
      await expect(
        resolveAndPinTarget(url, resolverWith({ "site.test": ["93.184.216.34"] })),
      ).rejects.toMatchObject({ code: "policy_denied" });
    }
  });

  it("fails closed when DNS yields no usable records", async () => {
    await expect(
      resolveAndPinTarget(ORIGIN, resolverWith({ "site.test": [] })),
    ).rejects.toMatchObject({ code: "unreachable" });
    await expect(resolveAndPinTarget(ORIGIN, resolverWith({}))).rejects.toMatchObject({
      code: "dns_failed",
    });
  });

  it("pins the validated IP for the socket", async () => {
    const t = await resolveAndPinTarget(
      ORIGIN,
      resolverWith({ "site.test": ["93.184.216.34", "8.8.8.8"] }),
    );
    expect(t.pinnedIp).toBe("93.184.216.34");
    expect(t.host).toBe("site.test");
  });
});

describe("runPassiveRecon — redirects, scope, quotas", () => {
  const resolver = resolverWith({ "site.test": ["93.184.216.34"] });

  it("follows a same-host redirect and records the final page", async () => {
    const { factory, calls } = recorder([
      page(301, { location: ["https://site.test/home"] }),
      page(200),
    ]);
    const r = await runPassiveRecon({
      canonicalOrigin: ORIGIN,
      allowedPaths: [],
      resolver,
      fetcher: factory,
    });
    expect(r.pages[0]?.status).toBe(200);
    expect(calls.map((c) => c.path)).toEqual(["/", "/home"]);
  });

  it("refuses to follow cross-host redirects — returns the 3xx as evidence", async () => {
    const { factory, calls } = recorder([page(302, { location: ["https://evil.test/pwn"] })]);
    const r = await runPassiveRecon({
      canonicalOrigin: ORIGIN,
      allowedPaths: [],
      resolver,
      fetcher: factory,
    });
    expect(r.pages[0]?.status).toBe(302);
    expect(r.pages[0]?.redirectLocation).toBe("https://evil.test/pwn");
    expect(calls).toHaveLength(1); // never fetched evil.test
  });

  it("refuses https→http downgrades and credential-bearing redirects", async () => {
    for (const loc of ["http://site.test/", "https://user:pw@site.test/x"]) {
      const { factory, calls } = recorder([page(302, { location: [loc] })]);
      const r = await runPassiveRecon({
        canonicalOrigin: ORIGIN,
        allowedPaths: [],
        resolver,
        fetcher: factory,
      });
      expect(r.pages[0]?.status).toBe(302);
      expect(calls).toHaveLength(1);
    }
  });

  it("caps redirect chains at maxRedirects", async () => {
    const { factory, calls } = recorder((_req, i) =>
      page(302, { location: [`https://site.test/r${i}`] }),
    );
    await runPassiveRecon({
      canonicalOrigin: ORIGIN,
      allowedPaths: [],
      resolver,
      fetcher: factory,
      limits: { maxRedirects: 2 },
    });
    expect(calls.length).toBe(3); // initial + 2 follows, then returned unfollowed
  });

  it("enforces the per-run request budget over permitted paths", async () => {
    const { factory } = recorder(() => page(200));
    await expect(
      runPassiveRecon({
        canonicalOrigin: ORIGIN,
        allowedPaths: ["/a", "/b", "/c", "/d", "/e", "/f", "/g", "/h", "/i"],
        resolver,
        fetcher: factory,
      }),
    ).rejects.toMatchObject({ code: "quota_exceeded" });
  });

  it("fetches only the root plus explicitly permitted paths", async () => {
    const { factory, calls } = recorder(() => page(200));
    const r = await runPassiveRecon({
      canonicalOrigin: ORIGIN,
      allowedPaths: ["/ok"],
      resolver,
      fetcher: factory,
    });
    // "/" is implicit (the submitted origin); only granted paths are fetched.
    expect(calls.map((c) => c.path)).toEqual(["/", "/ok"]);
    expect(r.pages).toHaveLength(2);
  });

  it("normalizes percent-encoded traversal out of permitted paths — cannot smuggle", async () => {
    const { factory, calls } = recorder(() => page(200));
    const r = await runPassiveRecon({
      canonicalOrigin: ORIGIN,
      allowedPaths: ["/%2e%2e/admin", "/%252e%252e/escape", "/ok/../x", "\\windows\\path"],
      resolver,
      fetcher: factory,
    });
    // Every smuggle attempt fails normalization inside checkPathPermitted —
    // only the root GET ever reaches the network.
    expect(calls.map((c) => c.path)).toEqual(["/"]);
    expect(r.pages).toHaveLength(1);
  });

  it("appends a limitation instead of crashing when the run deadline hits", async () => {
    const { factory } = recorder(() => page(200));
    const r = await runPassiveRecon({
      canonicalOrigin: ORIGIN,
      allowedPaths: ["/a", "/b"],
      resolver,
      fetcher: factory,
      limits: { runDeadlineMs: -1 },
    });
    expect(r.pages.length).toBeLessThan(3);
    expect(r.limitations.some((l) => l.includes("deadline"))).toBe(true);
  });
});
