import {
  CONTRACT_SCHEMA_VERSION,
  ModelProposalSchema,
  TestPackIdSchema,
  type ModelProposal,
  type ProposalRejectionCode,
} from "@highcastle/contracts";
import { redactText } from "./redaction.js";

/**
 * Untrusted model-proposal validation.
 *
 * This is the explicit handling path for rejected or malicious AI plans.
 * `ModelProposalSchema` is strict by construction — any injected field
 * (`shellCommand`, `targetUrl`, `allowedHosts`, `grantPermissions`, …) is an
 * `unrecognized_keys` failure mapped to `forbidden_field`. Validation never
 * executes, never partially accepts, and produces a stable
 * `ProposalRejectionCode` for audit (`model_call.outcome =
 * policy_conflict`/`malformed` upstream).
 *
 * Checks run in a fixed order so the SAME malformed input always maps to the
 * SAME rejection code — a deterministic audit trail, not a lottery of Zod
 * issue ordering.
 */

export type ProposalValidation =
  | { ok: true; proposal: ModelProposal }
  | {
      ok: false;
      rejectionCode: ProposalRejectionCode;
      /** Bounded, secret-scrubbed detail for audit. */
      detail: string;
    };

function boundedDetail(raw: string): string {
  const single = redactText(raw.replace(/[\r\n]+/g, " "), 240);
  return single.slice(0, 240);
}

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return (
    v !== null &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    Object.getPrototypeOf(v) === Object.prototype
  );
}

export function validateModelProposal(raw: unknown): ProposalValidation {
  // 1. Empty / non-object → empty_proposal
  if (!isPlainRecord(raw) || Object.keys(raw).length === 0) {
    return {
      ok: false,
      rejectionCode: "empty_proposal",
      detail: "model proposal is empty or not an object",
    };
  }

  // 2. Wrong schema version → stale_version (checked before shape: a plan
  //    authored for another contract version must not be coerced).
  if (raw.schemaVersion !== CONTRACT_SCHEMA_VERSION) {
    return {
      ok: false,
      rejectionCode: "stale_version",
      detail: `schemaVersion ${JSON.stringify(raw.schemaVersion)} is not ${CONTRACT_SCHEMA_VERSION}`,
    };
  }

  // 3. Strict parse — classify the first deterministic failure category.
  const parsed = ModelProposalSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues;

    // Injected/unknown keys anywhere in the object → forbidden_field.
    const forbidden = issues.find((i) => i.code === "unrecognized_keys");
    if (forbidden !== undefined) {
      return {
        ok: false,
        rejectionCode: "forbidden_field",
        detail: boundedDetail(
          `unauthorized field(s) at ${forbidden.path.join(".") || "root"}: ${forbidden.message}`,
        ),
      };
    }

    // packId present but not an enumerated pack → unknown_pack. The model
    // tried to name a test that does not exist (hallucination or injection).
    const requestedTest = raw.requestedTest;
    if (isPlainRecord(requestedTest)) {
      const packId = requestedTest.packId;
      if (typeof packId === "string" && !TestPackIdSchema.safeParse(packId).success) {
        return {
          ok: false,
          rejectionCode: "unknown_pack",
          detail: boundedDetail(`requested pack is not an enumerated test pack`),
        };
      }
    }

    const first = issues[0];
    return {
      ok: false,
      rejectionCode: "schema_mismatch",
      detail: boundedDetail(
        first === undefined
          ? "proposal failed schema validation"
          : `${first.path.join(".") || "root"}: ${first.message}`,
      ),
    };
  }

  return { ok: true, proposal: parsed.data };
}
