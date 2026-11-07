import { CONTRACT_SCHEMA_VERSION } from "@highcastle/contracts";

/**
 * Structured hypothesis prompt for the controlled invoice application.
 *
 * The prompt carries only minimal, pre-sanitized context (route/component
 * description supplied by the caller — never raw secrets, tokens, or PII)
 * plus the approved pack manifest and scope summary. It instructs the model
 * to return exactly one JSON object conforming to `ModelProposalSchema`:
 * a BOLA hypothesis plus a `requestedTest` naming ONLY the enumerated
 * `bola-invoice-v1` pack. The model grants no permissions: authority flows
 * from human-approved scope (L04/L13) through deterministic policy code.
 */

export const ALLOWED_HYPOTHESIS_PACK_ID = "bola-invoice-v1" as const;
export const HYPOTHESIS_CATEGORY = "broken_object_authorization" as const;

/** Bound input sizes so prompts stay within a predictable token budget. */
export const MAX_SOURCE_CONTEXT_CHARS = 4000;
export const MAX_SCOPE_SUMMARY_CHARS = 1000;
export const MAX_ROUTE_SUMMARY_CHARS = 1000;

export interface HypothesisPromptInput {
  /**
   * Sanitized description of the invoice route/component under test,
   * e.g. `GET /api/invoices/:id reads invoice by id; owner check status
   * unknown`. The caller MUST sanitize before passing: no tokens, cookies,
   * keys, emails, or real customer data.
   */
  sanitizedSourceContext: string;
  /** Short scope summary, e.g. allowed pack + fixture roles + budget. */
  scopeSummary: string;
  /** Optional route under test, e.g. `GET /api/invoices/:id`. */
  routeSummary?: string;
  /** Test-pack manifest version the orchestrator pinned for this scan. */
  packVersion?: string;
}

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

function clip(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

const SYSTEM_INSTRUCTION = [
  "You are a security-test planner for HighCastle, an AI-assisted",
  "application-security platform. You propose READ-ONLY authorization checks",
  "against an OWNED synthetic invoice lab. You must output EXACTLY ONE JSON",
  "object and no other text, conforming to this schema:",
  "{",
  `  "schemaVersion": ${CONTRACT_SCHEMA_VERSION},`,
  '  "hypothesis": {',
  `    "category": "${HYPOTHESIS_CATEGORY}",`,
  '    "targetComponent": "short component name, e.g. invoice_lookup",',
  '    "reason": "why the check is worthwhile (plain prose, max 500 chars)",',
  '    "expectedSecureBehavior": "secure behavior asserted (plain prose, max 500 chars)"',
  "  },",
  '  "requestedTest": {',
  `    "packId": "${ALLOWED_HYPOTHESIS_PACK_ID}",`,
  '    "objective": "plain prose objective (max 280 chars, no shell syntax)"',
  "  }",
  "}",
  "Rules: requestedTest.packId MUST be exactly",
  `"bola-invoice-v1". No other pack ID is valid. Do NOT add any other keys:`,
  "no command, shell, url, host, target, permissions, scope, credentials, or",
  "extraArgs fields at any level. Prose fields must be plain text with no",
  "backticks, dollar signs, or backslashes. If the context is insufficient,",
  "still return the single most likely BOLA hypothesis for invoice_lookup —",
  "never invent a different vulnerability class or test mechanism.",
].join(" ");

/**
 * Build the OpenAI-compatible chat messages for a hypothesis call.
 * Pure function: no network, no secrets, safe to unit test.
 */
export function buildHypothesisMessages(
  input: HypothesisPromptInput,
): ChatMessage[] {
  const source = clip(input.sanitizedSourceContext, MAX_SOURCE_CONTEXT_CHARS);
  const scope = clip(input.scopeSummary, MAX_SCOPE_SUMMARY_CHARS);
  if (source.length === 0) {
    throw new Error("sanitizedSourceContext must not be empty.");
  }
  if (scope.length === 0) {
    throw new Error("scopeSummary must not be empty.");
  }
  const route = input.routeSummary
    ? clip(input.routeSummary, MAX_ROUTE_SUMMARY_CHARS)
    : "invoice_lookup";
  const packVersion = (input.packVersion ?? "1.0.0").trim() || "1.0.0";

  const userContent = [
    `Controlled target: owned synthetic invoice lab (pack ${ALLOWED_HYPOTHESIS_PACK_ID} v${packVersion}).`,
    `Route under test: ${route}.`,
    `Approved scope summary: ${scope}.`,
    `Sanitized source context: ${source}.`,
    "Return the single JSON object now.",
  ].join("\n");

  return [
    { role: "system", content: SYSTEM_INSTRUCTION },
    { role: "user", content: userContent },
  ];
}
