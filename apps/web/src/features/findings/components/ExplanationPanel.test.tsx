import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ExplanationPanel } from "./ExplanationPanel";
import type { StoredExplanation } from "../types";

function valid(): StoredExplanation {
  return {
    attemptId: "attempt-real-1",
    oracleVerdict: "reproduced",
    replayVerdict: null,
    summary: "Alice read Bob's invoice because the lookup ignored ownership.",
    whatHappened: "The lab looked the invoice up by id alone.",
    whyVerdict: "The cross-account read returned HTTP 200 with Bob's data.",
    replayMeaning: null,
    followUp: "Scope the lookup to the actor tenant.",
    evidenceIds: ["ev-own-1", "ev-cross-1"],
    requestedModel: "live-model-x",
    responseModel: "live-model-x",
    requestId: "req-live-1",
    latencyMs: 1234,
    rejectionCode: null,
  };
}

describe("ExplanationPanel", () => {
  it("renders validated prose with the oracle verdict, never a model verdict", () => {
    const html = renderToStaticMarkup(<ExplanationPanel explanation={valid()} />);
    expect(html).toContain("Alice read Bob");
    expect(html).toContain("oracle verdict: reproduced");
    expect(html).toContain("ev-own-1");
    expect(html).toContain("live-model-x");
    expect(html).toContain("req-live-1");
  });

  it("withholds prose and keeps the verdict when the call failed safely", () => {
    const html = renderToStaticMarkup(
      <ExplanationPanel
        explanation={{ ...valid(), summary: null, rejectionCode: "transport_error" }}
      />,
    );
    expect(html).toContain("withheld");
    expect(html).toContain("transport_error");
    expect(html).not.toContain("Alice read Bob");
  });

  it("renders the unavailable state when no explanation was served", () => {
    const html = renderToStaticMarkup(<ExplanationPanel explanation={null} />);
    expect(html).toContain("unavailable");
    expect(html).not.toContain("Alice read Bob");
  });
});
