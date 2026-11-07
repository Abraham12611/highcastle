import { describe, expect, it } from "vitest";

import { parseRunnerOutput } from "./output.ts";
import { makeRequest, probeLine, resultLine } from "./testkit/fakes.ts";
import type { RunnerInstanceId } from "@highcastle/contracts";

const RUNNER = "99999999-8888-4777-8666-555555555555" as RunnerInstanceId;

describe("parseRunnerOutput", () => {
  const request = makeRequest();

  it("extracts a valid result and probe lines", () => {
    const stdout = [
      JSON.stringify({
        v: 1,
        type: "started",
        at: new Date().toISOString(),
        runnerId: RUNNER,
        packId: "bola-invoice-v1",
        packVersion: "1.0.0",
      }),
      probeLine(
        "egress_ip",
        "tcp_connect:169.254.169.254:80",
        "network.egress_denied",
        "denied",
        "ENETUNREACH",
      ),
      resultLine(request, RUNNER),
      "",
    ].join("\n");
    const parsed = parseRunnerOutput(stdout, "", request, RUNNER);
    expect(parsed.result).not.toBeNull();
    expect(parsed.result?.status).toBe("completed");
    expect(parsed.probes).toHaveLength(1);
    expect(parsed.probes[0]?.ruleId).toBe("network.egress_denied");
    expect(parsed.malformedLines).toBe(0);
  });

  it("discards a result whose nonce does not echo the request", () => {
    const stdout = resultLine(request, RUNNER, { nonce: "f".repeat(32) });
    const parsed = parseRunnerOutput(stdout, "", request, RUNNER);
    expect(parsed.result).toBeNull();
    expect(parsed.resultError).toContain("echo mismatch");
  });

  it("discards a result for a different runner id", () => {
    const other = "11111111-2222-4333-8444-555555555555" as RunnerInstanceId;
    const stdout = resultLine(request, other);
    const parsed = parseRunnerOutput(stdout, "", request, RUNNER);
    expect(parsed.result).toBeNull();
  });

  it("rejects a schema-invalid result", () => {
    const bad = JSON.stringify({
      v: 1,
      type: "result",
      at: new Date().toISOString(),
      result: { bogus: true },
    });
    const parsed = parseRunnerOutput(bad, "", request, RUNNER);
    expect(parsed.result).toBeNull();
    expect(parsed.resultError).toContain("schema");
  });

  it("reports absence of a result line honestly", () => {
    const parsed = parseRunnerOutput("", "boom", request, RUNNER);
    expect(parsed.result).toBeNull();
    expect(parsed.resultError).toContain("no result line");
    expect(parsed.stderrExcerpt).toBe("boom");
  });

  it("counts malformed lines without trusting them", () => {
    const stdout = ["not json", "{bad", resultLine(request, RUNNER)].join("\n");
    const parsed = parseRunnerOutput(stdout, "", request, RUNNER);
    expect(parsed.malformedLines).toBe(2);
    expect(parsed.result).not.toBeNull();
  });

  it("ignores probe lines with unknown rule ids or outcomes", () => {
    const stdout = [
      JSON.stringify({
        v: 1,
        type: "probe",
        at: new Date().toISOString(),
        probe: "x",
        operation: "op",
        ruleId: "invented.rule",
        outcome: "denied",
        detail: "d",
      }),
      JSON.stringify({
        v: 1,
        type: "probe",
        at: new Date().toISOString(),
        probe: "y",
        operation: "op",
        ruleId: null,
        outcome: "magical",
        detail: "d",
      }),
    ].join("\n");
    const parsed = parseRunnerOutput(stdout, "", request, RUNNER);
    expect(parsed.probes).toHaveLength(0);
  });
});
