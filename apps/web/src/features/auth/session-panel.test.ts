import { describe, expect, it } from "vitest";
import { toSessionView } from "./session-panel";

describe("toSessionView (E5 session contract)", () => {
  it("maps 401 to signed-out", () => {
    expect(toSessionView(401, null)).toEqual({ state: "signed-out" });
  });

  it("maps a demo session with expiry", () => {
    expect(
      toSessionView(200, {
        data: { session: { kind: "demo", userId: "u1", expiresAt: "2026-11-07T00:00:00Z" } },
      }),
    ).toEqual({ state: "demo", expiresAt: "2026-11-07T00:00:00Z" });
  });

  it("lights up any future account kind with zero UI changes", () => {
    expect(
      toSessionView(200, { data: { session: { kind: "account", userId: "u9" } } }),
    ).toEqual({ state: "account", userId: "u9" });
  });

  it("fails closed on malformed payloads", () => {
    expect(toSessionView(200, null).state).toBe("failed");
    expect(toSessionView(200, { data: null }).state).toBe("failed");
    expect(toSessionView(500, null).state).toBe("failed");
  });
});
