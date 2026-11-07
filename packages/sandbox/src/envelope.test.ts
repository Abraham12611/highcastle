import { describe, expect, it } from "vitest";

import { buildRunnerEnvelope, envelopeContainsSecret, serializeEnvelope } from "./envelope.ts";
import { makeRequest } from "./testkit/fakes.ts";
import type { RunnerInstanceId } from "@highcastle/contracts";

const RUNNER = "99999999-8888-4777-8666-555555555555" as RunnerInstanceId;

describe("runner envelope", () => {
  it("carries protocol version, ids, request and secrets", () => {
    const request = makeRequest();
    const env = buildRunnerEnvelope({
      runnerId: RUNNER,
      labOrigin: "http://target-lab:3000",
      request,
      actorBearerToken: "lab-token-alice",
    });
    expect(env.protocolVersion).toBe(1);
    expect(env.runnerId).toBe(RUNNER);
    expect(env.request.nonce).toBe(request.nonce);
    expect(env.secrets.actorBearerToken).toBe("lab-token-alice");
  });

  it("serialized envelope contains the token (stdin-only delivery)", () => {
    const env = buildRunnerEnvelope({
      runnerId: RUNNER,
      labOrigin: "http://target-lab:3000",
      request: makeRequest(),
      actorBearerToken: "lab-token-alice",
    });
    const serialized = serializeEnvelope(env);
    expect(envelopeContainsSecret(serialized)).toBe(true);
    // ...and the docker args built for the same run must NOT contain it.
    // (Asserted end-to-end in controller.test.ts.)
  });
});
