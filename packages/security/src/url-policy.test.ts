import { describe, expect, it } from "vitest";
import {
  canonicalizeHttpsUrl,
  checkUrlAllowed,
  evaluateRedirect,
  isBlockedResolvedAddress,
  isDangerousHostname,
  isHostInScope,
  isIpLiteralHost,
} from "./url-policy.js";

describe("isIpLiteralHost — every IPv4/IPv6 spelling", () => {
  it("detects all numeric address forms", () => {
    for (const host of [
      "127.0.0.1",
      "127.1",
      "127.0.1",
      "2130706433", // decimal integer
      "0177.0.0.1", // octal
      "0x7f000001", // hex
      "0x7f.1", // hex + decimal
      "169.254.169.254",
      "10.0.0.1",
      "::1",
      "[::1]",
      "::ffff:127.0.0.1",
      "[::ffff:7f00:1]",
      "fe80::1",
      "0:0:0:0:0:0:0:1",
    ]) {
      expect(isIpLiteralHost(host), host).toBe(true);
    }
  });

  it("does not flag ordinary hostnames", () => {
    for (const host of [
      "example.com",
      "target-lab",
      "target-lab.internal",
      "api.staging.example.co",
      "xn--nxasmq6b.example",
    ]) {
      expect(isIpLiteralHost(host), host).toBe(false);
    }
  });
});

describe("isDangerousHostname", () => {
  it("rejects local/metadata/wildcard destinations", () => {
    for (const host of [
      "localhost",
      "evil.localhost",
      "printer.local",
      "host.docker.internal",
      "metadata.google.internal",
      "instance-data",
      "metadata",
      "*",
      "*.example.com",
      "127.0.0.1",
      "2130706433",
      "[::1]",
    ]) {
      expect(isDangerousHostname(host), host).toBe(true);
    }
  });

  it("permits ordinary hostnames and the lab service name", () => {
    for (const host of ["example.com", "target-lab", "target-lab.internal"]) {
      expect(isDangerousHostname(host), host).toBe(false);
    }
  });
});

describe("isBlockedResolvedAddress — post-DNS defense in depth", () => {
  it("blocks loopback, private, link-local, metadata, CGNAT, multicast", () => {
    for (const ip of [
      "127.0.0.1",
      "127.53.9.1",
      "0.0.0.0",
      "10.0.0.1",
      "10.255.255.255",
      "172.16.0.1",
      "172.31.255.254",
      "192.168.1.1",
      "169.254.169.254", // cloud metadata (Vultr/AWS/DO)
      "169.254.0.1",
      "100.64.0.1", // CGNAT
      "192.0.0.1",
      "192.0.2.1",
      "198.18.0.1",
      "198.51.100.1",
      "203.0.113.7",
      "224.0.0.1",
      "255.255.255.255",
      "::1",
      "::",
      "::ffff:127.0.0.1",
      "::ffff:10.0.0.1",
      "fe80::1",
      "fc00::1",
      "fd00::1",
      "ff02::1",
      "2001:db8::1",
      "64:ff9b::808:808",
    ]) {
      expect(isBlockedResolvedAddress(ip), ip).toBe(true);
    }
  });

  it("permits ordinary public addresses", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "203.0.114.1", "2606:4700:4700::1111"]) {
      expect(isBlockedResolvedAddress(ip), ip).toBe(false);
    }
  });

  it("fails closed on unparseable input", () => {
    expect(isBlockedResolvedAddress("not-an-ip")).toBe(true);
    expect(isBlockedResolvedAddress("999.1.1.1")).toBe(true);
  });
});

describe("canonicalizeHttpsUrl", () => {
  it("accepts a plain https URL and strips the default port", () => {
    const result = canonicalizeHttpsUrl("https://example.com:443/a/b?x=1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.canonical.normalizedOrigin).toBe("https://example.com");
  });

  it("denies non-https schemes", () => {
    for (const raw of [
      "http://example.com/",
      "file:///etc/passwd",
      "data:text/html,<h1>x</h1>",
      "javascript:alert(1)",
      "ftp://example.com/",
    ]) {
      const result = canonicalizeHttpsUrl(raw);
      expect(result.ok, raw).toBe(false);
      if (!result.ok) {
        expect(result.reasons.map((r) => r.code)).toContain("unsafe_scheme");
      }
    }
  });

  it("denies credentials in userinfo", () => {
    const result = canonicalizeHttpsUrl("https://alice:s3cret@example.com/");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons.map((r) => r.code)).toContain("unsafe_credentials_in_url");
    }
  });

  it("denies non-default ports", () => {
    const result = canonicalizeHttpsUrl("https://example.com:8443/");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons.map((r) => r.code)).toContain("unsafe_port");
    }
  });

  it("denies IP-literal and metadata hosts", () => {
    for (const raw of [
      "https://169.254.169.254/latest/meta-data",
      "https://2130706433/",
      "https://0x7f000001/",
      "https://localhost/",
      "https://metadata.google.internal/",
    ]) {
      const result = canonicalizeHttpsUrl(raw);
      expect(result.ok, raw).toBe(false);
    }
  });
});

describe("evaluateRedirect", () => {
  const base = {
    currentUrl: "https://app.example.com/invoices",
    allowedHosts: ["app.example.com", "cdn.example.com"],
    allowedPaths: ["/invoices", "/assets"],
    deniedPaths: ["/invoices/admin"],
  };

  it("follows a same-host https redirect inside scope", () => {
    const result = evaluateRedirect({
      ...base,
      location: "https://app.example.com/invoices/inv_1",
    });
    expect(result.ok).toBe(true);
  });

  it("follows a relative redirect inside scope", () => {
    const result = evaluateRedirect({
      ...base,
      location: "/invoices/inv_2",
    });
    expect(result.ok).toBe(true);
  });

  it("denies a redirect to a host outside the authorized scope", () => {
    const result = evaluateRedirect({
      ...base,
      location: "https://evil.example.com/invoices",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons.map((r) => r.code)).toContain("redirect_target_denied");
    }
  });

  it("denies redirects to metadata, loopback and localhost", () => {
    for (const location of [
      "https://169.254.169.254/latest/meta-data",
      "https://127.0.0.1/",
      "https://localhost/admin",
      "https://[::1]/",
      "https://2130706433/",
      "https://0x7f000001/",
    ]) {
      const result = evaluateRedirect({ ...base, location });
      expect(result.ok, location).toBe(false);
    }
  });

  it("denies a scheme downgrade to http", () => {
    const result = evaluateRedirect({
      ...base,
      location: "http://app.example.com/invoices",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons.map((r) => r.code)).toContain("unsafe_scheme");
    }
  });

  it("denies a redirect carrying userinfo credentials", () => {
    const result = evaluateRedirect({
      ...base,
      location: "https://user:pass@app.example.com/invoices",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons.map((r) => r.code)).toContain("unsafe_credentials_in_url");
    }
  });

  it("denies a redirect to a denied path", () => {
    const result = evaluateRedirect({
      ...base,
      location: "https://app.example.com/invoices/admin/dump",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons.map((r) => r.code)).toContain("path_explicitly_denied");
    }
  });

  it("denies when the redirect hop limit is exceeded", () => {
    const result = evaluateRedirect({
      ...base,
      location: "https://app.example.com/invoices/loop",
      redirectsUsed: 3,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons.map((r) => r.code)).toContain("redirect_limit_exceeded");
    }
  });
});

describe("checkUrlAllowed — full scope gate", () => {
  const scope = {
    allowedHosts: ["app.example.com"],
    allowedPaths: ["/invoices"],
    deniedPaths: ["/invoices/admin"],
  };

  it("permits an in-scope https URL", () => {
    expect(checkUrlAllowed("https://app.example.com/invoices/inv_1", scope)).toHaveLength(0);
  });

  it("denies out-of-scope host even on an allowed path", () => {
    const reasons = checkUrlAllowed("https://other.example.com/invoices/inv_1", scope);
    expect(reasons.map((r) => r.code)).toContain("host_out_of_scope");
  });

  it("denies in-scope host on a denied path", () => {
    const reasons = checkUrlAllowed("https://app.example.com/invoices/admin", scope);
    expect(reasons.map((r) => r.code)).toContain("path_explicitly_denied");
  });

  it("cannot be widened by query-string tricks", () => {
    const reasons = checkUrlAllowed("https://app.example.com/admin?path=/invoices", scope);
    expect(reasons.length).toBeGreaterThan(0);
  });
});

describe("isHostInScope", () => {
  it("matches exactly, case-insensitively, ignoring trailing dot", () => {
    expect(isHostInScope("APP.example.com", ["app.example.com"])).toBe(true);
    expect(isHostInScope("app.example.com.", ["app.example.com"])).toBe(true);
  });

  it("does not let a scoped parent cover an attacker subdomain", () => {
    expect(isHostInScope("evil.example.com", ["example.com"])).toBe(false);
    expect(isHostInScope("notexample.com", ["example.com"])).toBe(false);
  });
});
