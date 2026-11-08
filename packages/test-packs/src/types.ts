/**
 * Shared evidence types for bola-invoice-v1 (L15).
 *
 * These shapes carry OBSERVED facts only: HTTP statuses, parsed bodies,
 * revision echoes. They never carry credentials, and every stored excerpt
 * is already sanitized (see `redact.ts`). The verdict itself lives in
 * `oracle.ts`; transport lives in `runner.ts`.
 */

import type { AssertionOutcome, OracleVerdict, ReplayVerdict } from "@highcastle/contracts";
import type { BOLA_ORACLE_VERSION } from "./manifest.js";
import type { TrustedLabRevision } from "./fixtures.js";

/** One observed HTTP round-trip: status, raw text, and parsed JSON (if any). */
export interface ObservedHttpResponse {
  status: number;
  /** Raw response text (kept in memory only; stored evidence uses excerpts). */
  bodyText: string;
  /** Parsed JSON body, or null when the body is empty/unparsable. */
  body: unknown;
  /**
   * Revision reported by the response (`meta.revision`, else the
   * `x-target-lab-revision` header), or null when absent.
   */
  revisionEcho: string | null;
}

/** Full observed input to the oracle for one attempt. */
export interface BolaAttemptInput {
  attemptId: string;
  expectedRevision: TrustedLabRevision;
  health: ObservedHttpResponse;
  ready: ObservedHttpResponse;
  meta: ObservedHttpResponse;
  /** P1: Alice reads her own invoice_A. */
  ownInvoice: ObservedHttpResponse;
  /** S1: Alice attempts Bob's invoice_B. */
  crossInvoice: ObservedHttpResponse;
}

/** Oracle output: observed legs plus the independent verdict. */
export interface BolaAttemptAdjudication {
  attemptId: string;
  oracleVersion: typeof BOLA_ORACLE_VERSION;
  baseline: AssertionOutcome;
  securityCheck: AssertionOutcome;
  verdict: OracleVerdict;
  preconditionsOk: boolean;
  /** Stable, secret-free reason strings (safe to persist and display). */
  reasons: string[];
}

/** Replay comparison output for one patched-target run. */
export interface BolaReplayAdjudication {
  attemptVerdict: BolaAttemptAdjudication;
  replayVerdict: ReplayVerdict;
}

/** Minimal selected invoice fields kept as sanitized evidence. */
export interface SelectedInvoiceEvidence {
  id: string;
  ownerId: string;
  tenantId: string;
  number: string;
  revisionEcho: string | null;
}

/** Sanitized exchange record (subset of the contract's exchange shape). */
export interface SanitizedExchangeRecord {
  method: "GET" | "POST";
  path: string;
  status: number;
  bodyHash: string;
  bodyExcerptRedacted: string;
}
