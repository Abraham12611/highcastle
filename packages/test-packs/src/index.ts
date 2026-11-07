/**
 * @highcastle/test-packs — deterministic BOLA test pack + oracle (L15).
 *
 * - `manifest.ts`: versioned `bola-invoice-v1` manifest (from L03 contracts).
 * - `fixtures.ts`: trusted lab expectations (mirrors the L11 lab manifest).
 * - `redact.ts`: evidence sanitization + digests.
 * - `oracle.ts`: independent deterministic verdict (no network, no models).
 * - `runner.ts`: executable HTTP adapter + `SandboxResult` normalization.
 */

export {
  BOLA_MAX_DURATION_SECONDS,
  BOLA_MAX_REQUESTS,
  BOLA_ORACLE_VERSION,
  BOLA_PACK_ID,
  BOLA_PACK_MANIFEST,
  BOLA_PACK_VERSION,
  BOLA_PERMITTED_METHODS,
  BOLA_STEP_IDS,
  assertBolaManifestInvariants,
  type BolaStepId,
} from "./manifest.js";
export {
  KNOWN_INVOICE_IDS,
  TRUSTED_ACTORS,
  TRUSTED_FIXTURE_SET,
  TRUSTED_FIXTURE_VERSION,
  TRUSTED_INVOICES,
  TRUSTED_LAB_REVISIONS,
  credentialRefFor,
  isTrustedLabRevision,
  type KnownInvoiceId,
  type TrustedActor,
  type TrustedInvoiceIdentity,
  type TrustedLabRevision,
} from "./fixtures.js";
export {
  MAX_EXCERPT_CHARS,
  REDACTED_VALUE,
  redactHeaderValue,
  redactHeaders,
  redactPath,
  sanitizeBodyExcerpt,
  sha256Hex,
} from "./redact.js";
export {
  adjudicateAttempt,
  adjudicateReplay,
  checkPreconditions,
  classifyBaseline,
  classifySecurityCheck,
  invoiceIdentity,
  labErrorCode,
  selectEvidenceFields,
} from "./oracle.js";
export {
  generateAttemptNonce,
  runBolaPack,
  toSandboxResult,
  type PackRunOptions,
  type PackRunResult,
  type SandboxResultContext,
} from "./runner.js";
export { buildReplayRecord, type ReplayProvenanceRecord } from "./replay.js";
export type {
  BolaAttemptAdjudication,
  BolaAttemptInput,
  BolaReplayAdjudication,
  ObservedHttpResponse,
  SanitizedExchangeRecord,
  SelectedInvoiceEvidence,
} from "./types.js";
