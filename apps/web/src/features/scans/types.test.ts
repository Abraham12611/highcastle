import { describe, expect, it } from "vitest";
import { isTerminalEvent, laneForEvent, parseFrame } from "./types";

describe("parseFrame", () => {
  it("parses a valid L17 frame", () => {
    const f = parseFrame(
      "test.executed",
      JSON.stringify({
        scanId: "11111111-1111-4111-8111-111111111111",
        seq: 7,
        phase: "executing",
        safeSummary: "ok",
        attemptId: null,
        occurredAt: "2026-11-06T12:00:00Z",
        findingId: "88888888-8888-4888-8888-888888888888",
      }),
    );
    expect(f?.seq).toBe(7);
    expect(f?.eventType).toBe("test.executed");
    expect(f?.findingId).toBe("88888888-8888-4888-8888-888888888888");
  });

  it("rejects unknown event types and bad shapes", () => {
    expect(parseFrame("invented.event", "{}")).toBeNull();
    expect(parseFrame("test.executed", "nope")).toBeNull();
    expect(
      parseFrame("test.executed", JSON.stringify({ seq: 0 })),
    ).toBeNull();
  });
});

describe("laneForEvent / isTerminalEvent", () => {
  it("maps lanes deterministically", () => {
    expect(laneForEvent("sandbox.action_blocked")).toBe("containment");
    expect(laneForEvent("test.plan.validated")).toBe("model");
    expect(laneForEvent("test.executed")).toBe("sandbox");
    expect(laneForEvent("finding.confirmed")).toBe("finding");
  });
  it("terminal events are exactly the scan lifecycle endings", () => {
    expect(isTerminalEvent("scan.completed")).toBe(true);
    expect(isTerminalEvent("scan.failed")).toBe(true);
    expect(isTerminalEvent("scan.canceled")).toBe(true);
    expect(isTerminalEvent("test.executed")).toBe(false);
    expect(isTerminalEvent("scan.stage.updated")).toBe(false);
  });
});
