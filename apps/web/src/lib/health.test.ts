import { describe, expect, it } from "vitest";
import { healthPayload } from "./health";

describe("healthPayload", () => {
  it("returns an ok payload with an ISO 8601 timestamp", () => {
    const payload = healthPayload("web", new Date("2026-11-06T00:00:00.000Z"));
    expect(payload).toEqual({
      status: "ok",
      service: "web",
      timestamp: "2026-11-06T00:00:00.000Z",
    });
  });
});
