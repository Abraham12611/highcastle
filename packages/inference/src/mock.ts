import type {
  ModelProposal,
  ProposalRejectionCode,
} from "@highcastle/contracts";
import { VultrInferenceError } from "./errors.js";
import type {
  GenerateHypothesisInput,
  HypothesisResult,
  ModelCallMetadata,
} from "./client.js";

/**
 * Clearly isolated TEST-ONLY mock for the Vultr inference adapter.
 *
 * Gating: constructing the mock throws `mock_not_allowed` unless the
 * process is running inside an explicit test environment —
 * `VITEST === "true"`, `NODE_ENV === "test"`, or
 * `HIGHCASTLE_INFERENCE_ALLOW_MOCK === "1"`. Production code paths
 * (`VultrInferenceClient.fromEnv`) never consult this module and never
 * fall back to a mock: without credentials they throw
 * `missing_credentials` instead.
 *
 * The mock never touches the network and returns caller-programmed
 * scenarios so unit tests can cover every outcome deterministically.
 */

export type MockScenario =
  | { kind: "valid"; proposal?: Partial<ModelProposal> }
  | { kind: "invalid"; rejectionCode?: ProposalRejectionCode; issues?: string[] }
  | { kind: "error"; code?: "timeout" | "rate_limited" | "provider_error" };

export const DEFAULT_MOCK_MODEL = "mock-vultr-model-for-tests";

const VALID_MOCK_PROPOSAL: ModelProposal = {
  schemaVersion: 1,
  hypothesis: {
    category: "broken_object_authorization",
    targetComponent: "invoice_lookup",
    reason: "Ownership check may be absent for cross-tenant reads",
    expectedSecureBehavior:
      "A customer cannot read another customer's invoice",
  },
  requestedTest: {
    packId: "bola-invoice-v1",
    objective: "Verify ownership enforcement using synthetic identities",
  },
};

function isTestEnvironment(env: NodeJS.ProcessEnv): boolean {
  return (
    env["VITEST"] === "true" ||
    env["NODE_ENV"] === "test" ||
    env["HIGHCASTLE_INFERENCE_ALLOW_MOCK"] === "1"
  );
}

export function assertMockAllowed(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!isTestEnvironment(env)) {
    throw new VultrInferenceError(
      "mock_not_allowed",
      "Test mock inference is not allowed outside an explicit test " +
        "environment (VITEST, NODE_ENV=test, or " +
        "HIGHCASTLE_INFERENCE_ALLOW_MOCK=1). Production must use the real " +
        "Vultr Serverless Inference endpoint.",
    );
  }
}

function metadata(
  outcome: ModelCallMetadata["outcome"],
  errorCode: ModelCallMetadata["errorCode"],
): ModelCallMetadata {
  return {
    provider: "vultr",
    model: DEFAULT_MOCK_MODEL,
    responseModel: DEFAULT_MOCK_MODEL,
    requestId: "mock-request-id",
    latencyMs: 0,
    tokensInput: 0,
    tokensOutput: 0,
    outcome,
    errorCode,
  };
}

export interface MockVultrClient {
  readonly isMockForTests: true;
  generateHypothesis(input: GenerateHypothesisInput): Promise<HypothesisResult>;
}

/** Create a deterministic mock client. Throws outside test environments. */
export function createMockVultrClientForTests(
  scenario: MockScenario = { kind: "valid" },
  env: NodeJS.ProcessEnv = process.env,
): MockVultrClient {
  assertMockAllowed(env);
  return {
    isMockForTests: true,
    generateHypothesis: async (): Promise<HypothesisResult> => {
      if (scenario.kind === "error") {
        const code = scenario.code ?? "provider_error";
        throw new VultrInferenceError(code, `Mock ${code} for tests.`);
      }
      if (scenario.kind === "invalid") {
        const rejectionCode = scenario.rejectionCode ?? "schema_mismatch";
        const outcome =
          rejectionCode === "forbidden_field" ||
          rejectionCode === "unknown_pack" ||
          rejectionCode === "out_of_scope_pack"
            ? "policy_conflict"
            : "malformed";
        return Promise.resolve({
          proposal: null,
          validationStatus: "invalid",
          rejectionCode,
          issues: scenario.issues ?? ["Mock invalid proposal for tests."],
          rawProposalRedacted: { mock: true },
          metadata: metadata(outcome, outcome),
        });
      }
      return Promise.resolve({
        proposal: { ...VALID_MOCK_PROPOSAL, ...scenario.proposal },
        validationStatus: "valid",
        rejectionCode: null,
        issues: [],
        rawProposalRedacted: { mock: true },
        metadata: metadata("success", null),
      });
    },
  };
}
