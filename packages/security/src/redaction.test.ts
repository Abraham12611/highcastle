import { describe, expect, it } from "vitest";
import {
  REDACTED_VALUE,
  looksLikeSecret,
  redactHeaders,
  redactModelText,
  redactText,
  redactUrlValue,
  redactValue,
} from "./redaction.js";

describe("redactHeaders", () => {
  it("redacts sensitive header names regardless of value", () => {
    const out = redactHeaders({
      Authorization: "Bearer abc123",
      Cookie: "session=xyz",
      "Set-Cookie": "sid=abc; HttpOnly",
      "X-Api-Key": "key-123",
      "Proxy-Authorization": "Basic dXNlcjpwYXNz",
      "X-CSRF-Token": "tok",
    });
    for (const v of Object.values(out)) {
      expect(v).toBe(REDACTED_VALUE);
    }
  });

  it("redacts secret-shaped values under non-sensitive names", () => {
    const out = redactHeaders({
      "X-Custom-Debug": "Bearer sk-live-abcdef1234567890",
      "X-Trace":
        "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
    });
    expect(out["X-Custom-Debug"]).toBe(REDACTED_VALUE);
    expect(out["X-Trace"]).toBe(REDACTED_VALUE);
  });

  it("keeps ordinary values intact", () => {
    const out = redactHeaders({
      "Content-Type": "application/json",
      "X-Request-Id": "req_123",
      "Cache-Control": "no-store",
    });
    expect(out["Content-Type"]).toBe("application/json");
    expect(out["X-Request-Id"]).toBe("req_123");
  });

  it("accepts iterable entry lists (e.g. Headers.entries())", () => {
    const headers = new Headers({ authorization: "Bearer tok", "x-a": "1" });
    const out = redactHeaders(headers.entries() as Iterable<[string, string]>);
    expect(out["authorization"]).toBe(REDACTED_VALUE);
    expect(out["x-a"]).toBe("1");
  });

  it("lets callers add sensitive names but never remove built-ins", () => {
    const out = redactHeaders({ "X-Tenant-Secret": "plainvalue123", Cookie: "a=b" }, [
      "x-tenant-secret",
    ]);
    expect(out["X-Tenant-Secret"]).toBe(REDACTED_VALUE);
    expect(out["Cookie"]).toBe(REDACTED_VALUE);
  });
});

describe("redactText", () => {
  it("redacts Bearer and Basic credentials", () => {
    expect(redactText("auth: Bearer abcdef123456789")).toContain(`Bearer ${REDACTED_VALUE}`);
    expect(redactText("Basic dXNlcjpwYXNzd29yZA==")).toContain(`Basic ${REDACTED_VALUE}`);
  });

  it("redacts JWTs", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    expect(redactText(`token=${jwt}`)).not.toContain("eyJhbGci");
  });

  it("redacts provider key shapes", () => {
    for (const secret of [
      "AKIAIOSFODNN7EXAMPLE",
      "sk-live_1234567890abcdef",
      "sk-proj-abcd1234abcd1234abcd",
      "ghp_abcdefghijklmnop1234567890",
      "github_pat_11ABCDEFG0abcdefghij_1234567890abcd",
      "xoxb-1234567890-abcdefghijkl",
    ]) {
      expect(redactText(`leak: ${secret}`), secret).not.toContain(secret);
    }
  });

  it("redacts key=value secrets but keeps the key name", () => {
    const out = redactText("api_key=supersecretvalue123 password=hunter2");
    expect(out).toContain("api_key=");
    expect(out).toContain("password=");
    expect(out).not.toContain("supersecretvalue123");
    expect(out).not.toContain("hunter2");
  });

  it("redacts credentials embedded in URLs", () => {
    const out = redactText("connect postgres://admin:Sup3rSecret@db.internal:5432/app");
    expect(out).not.toContain("Sup3rSecret");
    expect(out).toContain("postgres://");
  });

  it("redacts PEM private key blocks", () => {
    const pem = `-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA7\n-----END RSA PRIVATE KEY-----`;
    expect(redactText(pem)).toBe(`${REDACTED_VALUE}_PRIVATE_KEY_BLOCK`);
  });

  it("bounds output length", () => {
    const big = "x".repeat(30_000);
    expect(redactText(big).length).toBeLessThanOrEqual(20_050);
  });
});

describe("redactUrlValue", () => {
  it("strips userinfo, query and fragment", () => {
    const out = redactUrlValue(
      "https://alice:secret@app.example.com/invoices?session=abc&token=xyz#frag",
    );
    expect(out).toBe("https://app.example.com/invoices");
  });

  it("returns a placeholder for unparseable input", () => {
    expect(redactUrlValue("not a url")).toBe("[REDACTED-URL]");
  });
});

describe("redactValue — deep object redaction", () => {
  it("redacts sensitive keys at any depth", () => {
    const out = redactValue({
      request: {
        headers: { authorization: "Bearer x", "content-type": "json" },
        body: { password: "hunter2", note: "safe" },
      },
      list: [{ token: "abc" }, { value: 1 }],
    }) as Record<string, unknown>;
    const req = out["request"] as Record<string, unknown>;
    const headers = req["headers"] as Record<string, unknown>;
    const body = req["body"] as Record<string, unknown>;
    expect(headers["authorization"]).toBe(REDACTED_VALUE);
    expect(headers["content-type"]).toBe("json");
    expect(body["password"]).toBe(REDACTED_VALUE);
    expect(body["note"]).toBe("safe");
    const list = out["list"] as Array<Record<string, unknown>>;
    expect(list[0]?.["token"]).toBe(REDACTED_VALUE);
    expect(list[1]?.["value"]).toBe(1);
  });

  it("redacts secret-shaped strings even under innocent keys", () => {
    const out = redactValue({
      comment: "here is a key: AKIAIOSFODNN7EXAMPLE ok",
    }) as Record<string, unknown>;
    expect(out["comment"]).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("degrades non-plain objects and circular refs safely", () => {
    const cyc: Record<string, unknown> = { a: 1 };
    cyc["self"] = cyc;
    const out = redactValue({
      when: new Date("2026-01-01"),
      buf: Buffer.from("secret"),
      cyc,
    }) as Record<string, unknown>;
    expect(out["when"]).toBe(REDACTED_VALUE);
    expect(out["buf"]).toBe(REDACTED_VALUE);
    expect((out["cyc"] as Record<string, unknown>)["self"]).toBe("[CIRCULAR]");
  });
});

describe("redactModelText", () => {
  it("redacts and bounds model output before persistence", () => {
    const model = `sure, use token=sk-abcdefghijklmnop1234 ${"y".repeat(5000)}`;
    const out = redactModelText(model);
    expect(out).not.toContain("sk-abcdefghijklmnop1234");
    expect(out.length).toBeLessThanOrEqual(2010);
  });
});

describe("looksLikeSecret", () => {
  it("flags credential-shaped strings", () => {
    expect(looksLikeSecret("Bearer abcdef123456")).toBe(true);
    expect(looksLikeSecret("plain short")).toBe(false);
    expect(looksLikeSecret("content-type json")).toBe(false);
  });
});
