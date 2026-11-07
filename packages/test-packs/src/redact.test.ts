import { describe, expect, it } from "vitest";
import {
  MAX_EXCERPT_CHARS,
  REDACTED_VALUE,
  redactHeaderValue,
  redactHeaders,
  redactPath,
  sanitizeBodyExcerpt,
  sha256Hex,
} from "./redact.js";

describe("evidence redaction", () => {
  it("replaces secret headers wholesale regardless of case", () => {
    expect(redactHeaderValue("authorization", "Bearer lab-token-alice")).toBe(REDACTED_VALUE);
    expect(redactHeaderValue("Authorization", "Bearer lab-token-alice")).toBe(REDACTED_VALUE);
    expect(redactHeaderValue("COOKIE", "lab_session=lab-session-user_A")).toBe(REDACTED_VALUE);
    expect(redactHeaderValue("set-cookie", "lab_session=x; HttpOnly")).toBe(REDACTED_VALUE);
  });

  it("keeps non-secret headers but scrubs token-shaped values", () => {
    expect(redactHeaderValue("content-type", "application/json")).toBe("application/json");
    expect(redactHeaderValue("x-request-id", "uses lab-token-alice inside")).not.toContain(
      "lab-token-alice",
    );
  });

  it("redacts a header map without dropping benign entries", () => {
    const out = redactHeaders({
      "content-type": "application/json",
      authorization: "Bearer lab-token-alice",
      cookie: "lab_session=lab-session-user_A",
    });
    expect(out["content-type"]).toBe("application/json");
    expect(out["authorization"]).toBe(REDACTED_VALUE);
    expect(out["cookie"]).toBe(REDACTED_VALUE);
  });

  it("scrubs fixture tokens and session ids from body excerpts", () => {
    const excerpt = sanitizeBodyExcerpt(
      '{"actor":"x","token":"lab-token-alice","s":"lab-session-user_A","h":"Bearer abc123"}',
    );
    expect(excerpt).not.toContain("lab-token-alice");
    expect(excerpt).not.toContain("lab-session-user_A");
    expect(excerpt).toContain(REDACTED_VALUE);
  });

  it("bounds excerpts at the contract cap", () => {
    const long = "a".repeat(MAX_EXCERPT_CHARS + 500);
    const excerpt = sanitizeBodyExcerpt(long);
    expect(excerpt.length).toBeLessThanOrEqual(MAX_EXCERPT_CHARS + 1);
    expect(sanitizeBodyExcerpt("short")).toBe("short");
  });

  it("hashes sanitized bytes deterministically as lowercase hex", () => {
    const first = sha256Hex("sanitized-evidence");
    expect(first).toBe(sha256Hex("sanitized-evidence"));
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex("different")).not.toBe(first);
  });

  it("strips query strings from recorded paths", () => {
    expect(redactPath("/api/invoices/invoice_A")).toBe("/api/invoices/invoice_A");
    expect(redactPath("/api/invoices/invoice_A?token=lab-token-alice")).toBe(
      "/api/invoices/invoice_A",
    );
  });
});
