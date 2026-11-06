import {
  CONTRACT_SCHEMA_VERSION,
  ModelProposalSchema,
  type ModelProposal,
  type ProposalRejectionCode,
} from "@highcastle/contracts";
import { ALLOWED_HYPOTHESIS_PACK_ID } from "./prompt.js";

/**
 * Strict normalization + validation of untrusted model output.
 *
 * Only proposals that parse cleanly against the shared
 * `ModelProposalSchema` AND name the allowed `bola-invoice-v1` pack are
 * returned. Everything else is rejected with a `ProposalRejectionCode`
 * the orchestrator can audit — never executed, never silently repaired
 * into an executable plan.
 */

export type ProposalParseResult =
  | { status: "valid"; proposal: ModelProposal }
  | {
      status: "invalid";
      rejectionCode: ProposalRejectionCode;
      issues: string[];
    };

/** Extract embedded JSON, tolerating ```json fences around the object. */
function extractJsonPayload(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length === 0) return trimmed;
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence?.[1] !== undefined) return fence[1].trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) return trimmed.slice(first, last + 1);
  return trimmed;
}

const EXTRA_KEY_HINTS = [
  "shell",
  "command",
  "url",
  "host",
  "target",
  "permission",
  "scope",
  "credential",
  "extraargs",
  "allowedhosts",
  "grantpermissions",
];

function looksLikeForbiddenFieldIssue(message: string): boolean {
  const lower = message.toLowerCase();
  if (lower.includes("unrecognized key")) return true;
  return EXTRA_KEY_HINTS.some((hint) => lower.includes(hint));
}

/**
 * Parse one raw model content string into a validated proposal.
 * Never throws for malformed input — failures become rejection codes.
 */
export function parseModelProposal(content: string): ProposalParseResult {
  if (content.trim().length === 0) {
    return {
      status: "invalid",
      rejectionCode: "empty_proposal",
      issues: ["Model returned empty content."],
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonPayload(content)) as unknown;
  } catch {
    return {
      status: "invalid",
      rejectionCode: "schema_mismatch",
      issues: ["Model content is not valid JSON."],
    };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      status: "invalid",
      rejectionCode: "schema_mismatch",
      issues: ["Model JSON is not an object."],
    };
  }
  const record = parsed as Record<string, unknown>;
  if (
    record["schemaVersion"] !== undefined &&
    record["schemaVersion"] !== CONTRACT_SCHEMA_VERSION
  ) {
    return {
      status: "invalid",
      rejectionCode: "stale_version",
      issues: [
        `Unsupported schemaVersion ${String(record["schemaVersion"])}; expected ${CONTRACT_SCHEMA_VERSION}.`,
      ],
    };
  }
  const result = ModelProposalSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
    );
    const requestedTest = record["requestedTest"];
    const packId =
      typeof requestedTest === "object" && requestedTest !== null
        ? (requestedTest as Record<string, unknown>)["packId"]
        : undefined;
    if (typeof packId === "string" && packId !== ALLOWED_HYPOTHESIS_PACK_ID) {
      return {
        status: "invalid",
        rejectionCode: "unknown_pack",
        issues: [
          `Unknown packId "${packId}"; only "${ALLOWED_HYPOTHESIS_PACK_ID}" is executable.`,
          ...issues,
        ],
      };
    }
    if (issues.some(looksLikeForbiddenFieldIssue)) {
      return {
        status: "invalid",
        rejectionCode: "forbidden_field",
        issues,
      };
    }
    return { status: "invalid", rejectionCode: "schema_mismatch", issues };
  }
  if (result.data.requestedTest.packId !== ALLOWED_HYPOTHESIS_PACK_ID) {
    return {
      status: "invalid",
      rejectionCode: "out_of_scope_pack",
      issues: [
        `Pack "${result.data.requestedTest.packId}" is not approved for this flow.`,
      ],
    };
  }
  return { status: "valid", proposal: result.data };
}

const SECRET_KEY_PATTERN =
  /api[_-]?key|secret|token|bearer|cookie|authorization|set-cookie|password/i;

/**
 * Deep-redact a parsed model payload for safe storage/logging.
 * Drops keys that look credential-bearing, truncates long strings, and
 * caps object breadth so stored `rawProposalRedacted` can never smuggle
 * a secret or an unbounded dump into the DB.
 */
export function redactForStorage(value: unknown, depth = 0): unknown {
  if (typeof value === "string") {
    const cleaned = value
      .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[redacted]")
      .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, "Bearer [redacted]");
    return cleaned.length > 2000 ? `${cleaned.slice(0, 2000)}…` : cleaned;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((entry) => redactForStorage(entry, depth + 1));
  }
  if (value !== null && typeof value === "object") {
    if (depth > 6) return "[redacted: depth]";
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value).slice(0, 50)) {
      out[key] = SECRET_KEY_PATTERN.test(key)
        ? "[redacted]"
        : redactForStorage(entry, depth + 1);
    }
    return out;
  }
  return value;
}
