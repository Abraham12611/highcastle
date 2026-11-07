import { describe, expect, it } from "vitest";
import {
  DEMO_COOKIE,
  DEMO_WORKSPACE_ID,
  issueSessionCookieValue,
  newDemoSession,
  readCookie,
  verifySessionCookieValue,
  type DemoSession,
} from "./session-core";

const SECRET = "test-secret";

function demo(now: number): DemoSession {
  return { ...newDemoSession(now), expiresAt: now + 60_000 };
}

describe("signed session cookies", () => {
  it("round-trips a minted demo session", () => {
    const now = Date.now();
    const value = issueSessionCookieValue(demo(now), SECRET, now);
    const session = verifySessionCookieValue(value, "demo", SECRET, now + 1000);
    expect(session?.kind).toBe("demo");
    expect(session?.userId).toMatch(/^guest-/);
    if (session?.kind === "demo") {
      expect(session.workspaceId).toBe(DEMO_WORKSPACE_ID);
      expect(session.targetAlias).toBe("target-lab");
    }
  });

  it("rejects a tampered payload (signature mismatch)", () => {
    const now = Date.now();
    const value = issueSessionCookieValue(demo(now), SECRET, now);
    const [payload, sig] = value.split(".");
    const forged = `${Buffer.from(JSON.stringify({ v: 1, kind: "demo", uid: "admin", sid: "x", iat: 1, exp: 9999999999 })).toString("base64url")}.${sig}`;
    expect(verifySessionCookieValue(forged, "demo", SECRET)).toBeNull();
    expect(verifySessionCookieValue(`${payload}x.${sig}`, "demo", SECRET)).toBeNull();
  });

  it("rejects a cookie signed with a different secret", () => {
    const now = Date.now();
    const value = issueSessionCookieValue(demo(now), "other-secret", now);
    expect(verifySessionCookieValue(value, "demo", SECRET)).toBeNull();
  });

  it("rejects expired sessions", () => {
    const now = Date.now();
    const value = issueSessionCookieValue(demo(now), SECRET, now);
    expect(verifySessionCookieValue(value, "demo", SECRET, now + 61_000)).toBeNull();
  });

  it("rejects kind confusion (demo cookie cannot verify as account)", () => {
    const now = Date.now();
    const value = issueSessionCookieValue(demo(now), SECRET, now);
    expect(verifySessionCookieValue(value, "account", SECRET, now)).toBeNull();
  });

  it("guest cannot mint an account-kind session (no account issuer in demo path)", () => {
    const now = Date.now();
    const value = issueSessionCookieValue(demo(now), SECRET, now);
    const session = verifySessionCookieValue(value, "demo", SECRET, now);
    expect(session?.kind).not.toBe("account");
  });
});

describe("readCookie", () => {
  it("extracts a named cookie from a header list", () => {
    const h = new Headers({ cookie: `a=1; ${DEMO_COOKIE}=xyz.sig; b=2` });
    expect(readCookie(h, DEMO_COOKIE)).toBe("xyz.sig");
    expect(readCookie(h, "missing")).toBeNull();
  });
});
