import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/backend", () => ({
  verifyToken: vi.fn(),
}));
import { verifyToken } from "@clerk/backend";
import { clerkEnv, verifyClerkSession } from "./clerk";
import { internalUserIdForClerk } from "./membership";
import { getHighCastleSession } from "./session";

const ENV = { secretKey: "sk_test_x", publishableKey: "pk_test_x" };

function headersWith(cookie?: string): Headers {
  const h = new Headers();
  if (cookie) h.set("cookie", cookie);
  return h;
}

describe("clerkEnv / verifyClerkSession", () => {
  it("returns null when Clerk env is unconfigured (dev without keys)", async () => {
    const s = await verifyClerkSession(
      headersWith("__session=t"),
      clerkEnv({} as NodeJS.ProcessEnv),
    );
    expect(s).toBeNull();
    expect(verifyToken).not.toHaveBeenCalled();
  });

  it("rejects a forged/garbage session token", async () => {
    vi.mocked(verifyToken).mockRejectedValue(new Error("invalid signature"));
    const s = await verifyClerkSession(headersWith("__session=forged.jwt.here"), ENV);
    expect(s).toBeNull();
  });

  it("accepts a verified token and exposes clerk user/session ids", async () => {
    vi.mocked(verifyToken).mockResolvedValue({
      sub: "user_2abc",
      sid: "sess_9",
      exp: 1_800_000_000,
    } as never);
    const s = await verifyClerkSession(headersWith("__session=valid"), ENV);
    expect(s?.clerkUserId).toBe("user_2abc");
    expect(s?.sessionId).toBe("sess_9");
    expect(s?.expiresAt).toBe(1_800_000_000_000);
  });

  it("reads Bearer tokens too", async () => {
    vi.mocked(verifyToken).mockResolvedValue({
      sub: "user_b",
      sid: "sess_b",
      exp: 1_800_000_000,
    } as never);
    const h = headersWith();
    h.set("authorization", "Bearer tok_b");
    expect((await verifyClerkSession(h, ENV))?.clerkUserId).toBe("user_b");
  });
});

describe("internalUserIdForClerk", () => {
  it("is deterministic and UUID-shaped (stable mapping)", () => {
    const a = internalUserIdForClerk("user_2abc");
    expect(a).toBe(internalUserIdForClerk("user_2abc"));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(internalUserIdForClerk("user_OTHER")).not.toBe(a);
  });
});

describe("getHighCastleSession ordering + isolation", () => {
  it("returns a Clerk-backed account session when token verifies", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_x");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_x");
    vi.mocked(verifyToken).mockResolvedValue({
      sub: "user_2abc",
      sid: "sess_9",
      exp: 1_800_000_000,
    } as never);
    const s = await getHighCastleSession(headersWith("__session=valid"));
    expect(s?.kind).toBe("account");
    if (s?.kind === "account") {
      expect(s.userId).toBe(internalUserIdForClerk("user_2abc"));
    }
  });

  it("falls through to demo cookie when Clerk token is absent/forged", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_x");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_x");
    vi.mocked(verifyToken).mockRejectedValue(new Error("bad"));
    // A forged __session can't mint an account; without a demo cookie → null.
    const s = await getHighCastleSession(headersWith("__session=forged"));
    expect(s).toBeNull();
  });

  it("a demo cookie never produces an account session", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_x");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_x");
    // Even with a forged __session + a real-looking demo cookie, the result
    // kind can only be "demo" — guests cannot self-elevate.
    vi.mocked(verifyToken).mockRejectedValue(new Error("bad"));
    const s = await getHighCastleSession(headersWith("__session=forged; hc_demo=anything"));
    expect(s?.kind).not.toBe("account");
    expect(s?.kind).not.toBe("demo"); // "anything" isn't a valid HMAC mint
  });
});
