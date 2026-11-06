/**
 * Executable HTTP adapter for bola-invoice-v1 (L15).
 *
 * Runs the EXACT versioned step sequence against a live lab base URL and
 * records actual observed behavior — statuses, parsed bodies, revision
 * echoes — as sanitized evidence. It never asserts a vulnerability from
 * expectations: every leg is adjudicated by `oracle.ts` from observations.
 *
 * Step sequence (7 requests, inside the pack budget of 8 / 30s):
 *   P0-health  GET  /health            (liveness + revision echo)
 *   P0-ready   GET  /ready             (fixture seed check)
 *   P0-meta    GET  /api/meta          (fixture version/set + P2 manifest)
 *   setup-login  POST /api/auth/login  (Alice synthetic session; SCOPED
 *              SETUP PREREQUISITE — not a pack test-action method. The
 *              pack's `permittedMethods: ["GET"]` covers test actions; the
 *              login POST is the controller-approved setup step the issue
 *              card explicitly distinguishes. It IS counted in maxRequests.)
 *   setup-whoami GET /api/auth/whoami  (prove the session is Alice's)
 *   P1-own-invoice   GET /api/invoices/invoice_A (baseline, Alice's own)
 *   S1-cross-invoice GET /api/invoices/invoice_B (cross-account attempt)
 *
 * Only the two known fixture IDs are ever requested — no enumeration, no
 * scanning, no crafted IDs. Any transport failure, timeout, or budget
 * overrun stops the run; unobserved legs stay `unknown` so the oracle
 * reports `inconclusive`, never a false positive or a false pass.
 *
 * Interface notes for sibling lanes:
 * - L11 lab: consumes only the documented HTTP surface + revision headers.
 * - L14 runner: in production the controller resolves `actorCredentialRef`
 *   to the fixture credential and pins the target digest; this adapter
 *   receives the already-resolved value and a base URL (loopback in tests).
 * - L04 policy: URL guardrails here are minimal (http/https, no embedded
 *   credentials); scope allowlisting stays in the controller — this adapter
 *   must never be pointed at an arbitrary host by anyone but a test.
 * - L16 orchestrator: consumes `PackRunResult` and `toSandboxResult`.
 */

import { randomBytes, randomUUID } from "node:crypto";
import {
  AttemptIdSchema,
  AttemptNonceSchema,
  CONTRACT_SCHEMA_VERSION,
  RunnerInstanceIdSchema,
  type AttemptId,
  type SandboxResult,
  type VerificationVerdict,
} from "@highcastle/contracts";
import { TRUSTED_ACTORS, type TrustedLabRevision } from "./fixtures.js";
import { BOLA_MAX_DURATION_SECONDS, BOLA_MAX_REQUESTS } from "./manifest.js";
import { adjudicateAttempt, selectEvidenceFields } from "./oracle.js";
import { redactPath, sanitizeBodyExcerpt, sha256Hex } from "./redact.js";
import type {
  BolaAttemptAdjudication,
  ObservedHttpResponse,
  SanitizedExchangeRecord,
  SelectedInvoiceEvidence,
} from "./types.js";

export interface PackRunOptions {
  /** Lab base URL (tests: loopback stub; prod: controller-pinned target). */
  baseUrl: string;
  /**
   * Alice's lab-only fixture credential VALUE, resolved server-side by the
   * controller from `ref:synthetic:alice`. Never logged, never stored —
   * every recorded artifact is redacted before hashing.
   */
  aliceCredential: string;
  expectedRevision: TrustedLabRevision;
  attemptId?: string;
  authMode?: "session" | "bearer";
  fetchImpl?: typeof fetch;
  perRequestTimeoutMs?: number;
  maxRequests?: number;
  maxDurationSeconds?: number;
}

export interface PackRunResult {
  attemptId: AttemptId;
  startedAt: string;
  completedAt: string;
  expectedRevision: TrustedLabRevision;
  observedRevision: string | null;
  observedFixtureVersion: string | null;
  requestCount: number;
  durationMs: number;
  budgetExceeded: boolean;
  setupOk: boolean;
  /** All round-trips in order, sanitized (no headers, no secrets). */
  exchanges: SanitizedExchangeRecord[];
  ownEvidence: SelectedInvoiceEvidence | null;
  crossEvidence: SelectedInvoiceEvidence | null;
  adjudication: BolaAttemptAdjudication;
  verificationVerdict: VerificationVerdict;
}

const DEFAULT_PER_REQUEST_TIMEOUT_MS = 8000;
const SESSION_COOKIE_NAME = "lab_session";

function unobserved(): ObservedHttpResponse {
  return { status: 0, bodyText: "", body: null, revisionEcho: null };
}

function fixtureVersionOf(body: unknown): string | null {
  if (typeof body === "object" && body !== null) {
    const value = (body as Record<string, unknown>)["fixtureVersion"];
    return typeof value === "string" ? value : null;
  }
  return null;
}

interface StepOutcome {
  observed: ObservedHttpResponse;
  exchange: SanitizedExchangeRecord;
  sessionCookie: string | null;
}

export async function runBolaPack(options: PackRunOptions): Promise<PackRunResult> {
  const attemptId = AttemptIdSchema.parse(options.attemptId ?? randomUUID());

  const maxRequests = options.maxRequests ?? BOLA_MAX_REQUESTS;
  const maxDurationSeconds = options.maxDurationSeconds ?? BOLA_MAX_DURATION_SECONDS;
  if (maxRequests < 1 || maxRequests > BOLA_MAX_REQUESTS) {
    throw new Error(`maxRequests ${maxRequests} outside pack budget 1..${BOLA_MAX_REQUESTS}`);
  }
  if (maxDurationSeconds < 1 || maxDurationSeconds > BOLA_MAX_DURATION_SECONDS) {
    throw new Error(
      `maxDurationSeconds ${maxDurationSeconds} outside pack budget 1..${BOLA_MAX_DURATION_SECONDS}`,
    );
  }
  if (options.perRequestTimeoutMs !== undefined && options.perRequestTimeoutMs < 1) {
    throw new Error("perRequestTimeoutMs must be positive");
  }

  let base: URL;
  try {
    base = new URL(options.baseUrl);
  } catch {
    throw new Error("baseUrl must be a valid absolute URL");
  }
  if (base.protocol !== "http:" && base.protocol !== "https:") {
    throw new Error("baseUrl must use http or https");
  }
  if (base.username !== "" || base.password !== "") {
    throw new Error("baseUrl must not embed credentials");
  }
  if (options.aliceCredential === "") {
    throw new Error("aliceCredential must not be empty");
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const perRequestTimeoutMs = options.perRequestTimeoutMs ?? DEFAULT_PER_REQUEST_TIMEOUT_MS;
  const authMode = options.authMode ?? "session";
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const deadlineMs = startMs + maxDurationSeconds * 1000;

  const exchanges: SanitizedExchangeRecord[] = [];
  let requestCount = 0;
  let budgetExceeded = false;
  let sessionCookie: string | null = null;
  let setupOk = false;

  let health = unobserved();
  let ready = unobserved();
  let meta = unobserved();
  let ownInvoice = unobserved();
  let crossInvoice = unobserved();

  const overBudget = (): boolean => Date.now() > deadlineMs;

  async function doRequest(
    method: "GET" | "POST",
    path: string,
    init?: { body?: string; contentType?: string },
  ): Promise<StepOutcome | null> {
    if (requestCount >= maxRequests || overBudget()) {
      budgetExceeded = true;
      return null;
    }
    requestCount += 1;
    const headers: Record<string, string> = {};
    if (sessionCookie !== null) {
      headers["cookie"] = sessionCookie;
    } else if (authMode === "bearer") {
      headers["authorization"] = `Bearer ${options.aliceCredential}`;
    }
    if (init?.contentType !== undefined) {
      headers["content-type"] = init.contentType;
    }
    let status = 0;
    let bodyText = "";
    let revisionEcho: string | null = null;
    try {
      const requestInit: RequestInit = {
        method,
        headers,
        signal: AbortSignal.timeout(perRequestTimeoutMs),
      };
      if (init?.body !== undefined) {
        requestInit.body = init.body;
      }
      const response = await fetchImpl(new URL(path, base).toString(), requestInit);
      status = response.status;
      revisionEcho = response.headers.get("x-target-lab-revision");
      bodyText = await response.text();
      const setCookie = response.headers.get("set-cookie");
      if (setCookie !== null) {
        const pair = setCookie.split(";")[0]?.trim() ?? "";
        if (pair !== "" && !pair.endsWith("=")) {
          sessionCookie = pair;
        }
      }
    } catch {
      status = 0;
      bodyText = "";
    }
    let body: unknown = null;
    if (bodyText !== "") {
      try {
        body = JSON.parse(bodyText) as unknown;
      } catch {
        body = null;
      }
      if (body !== null && typeof body === "object") {
        const metaRevision = (body as Record<string, unknown>)["meta"];
        if (typeof metaRevision === "object" && metaRevision !== null) {
          const rev = (metaRevision as Record<string, unknown>)["revision"];
          if (typeof rev === "string") revisionEcho = rev;
        }
      }
    }
    const sanitized = sanitizeBodyExcerpt(bodyText);
    const exchange: SanitizedExchangeRecord = {
      method,
      path: redactPath(path),
      status,
      bodyHash: sha256Hex(sanitized),
      bodyExcerptRedacted: sanitized,
    };
    exchanges.push(exchange);
    return {
      observed: { status, bodyText, body, revisionEcho },
      exchange,
      sessionCookie,
    };
  }

  // P0: readiness + revision + fixture manifest.
  const healthStep = await doRequest("GET", "/health");
  if (healthStep !== null) health = healthStep.observed;
  const readyStep = await doRequest("GET", "/ready");
  if (readyStep !== null) ready = readyStep.observed;
  const metaStep = await doRequest("GET", "/api/meta");
  if (metaStep !== null) meta = metaStep.observed;

  // Setup: establish Alice's synthetic authenticated session.
  if (!budgetExceeded) {
    const loginBody = JSON.stringify({ token: options.aliceCredential });
    const login = await doRequest("POST", "/api/auth/login", {
      body: loginBody,
      contentType: "application/json",
    });
    const loginActorOk =
      login !== null && login.observed.status === 200 && isAliceWhoami(login.observed.body);
    if (loginActorOk && authMode === "bearer") {
      setupOk = true;
    } else if (loginActorOk && sessionCookie !== null) {
      const whoami = await doRequest("GET", "/api/auth/whoami");
      if (
        whoami !== null &&
        whoami.observed.status === 200 &&
        isAliceWhoami(whoami.observed.body)
      ) {
        setupOk = true;
      }
    }
  }

  // P1 + S1 with the SAME Alice session (or bearer identity).
  if (setupOk && !budgetExceeded) {
    const own = await doRequest("GET", "/api/invoices/invoice_A");
    if (own !== null) ownInvoice = own.observed;
  }
  if (setupOk && !budgetExceeded) {
    const cross = await doRequest("GET", "/api/invoices/invoice_B");
    if (cross !== null) crossInvoice = cross.observed;
  }

  const completedAt = new Date().toISOString();
  const adjudication = adjudicateAttempt({
    attemptId,
    expectedRevision: options.expectedRevision,
    health,
    ready,
    meta,
    ownInvoice,
    crossInvoice,
  });
  // Setup failures ground no matrix row: surface them as precondition-style
  // reasons while keeping the forced inconclusive verdict honest.
  if (!setupOk && !budgetExceeded) {
    adjudication.preconditionsOk = false;
    adjudication.verdict = "inconclusive";
    adjudication.reasons.unshift("setup Alice synthetic session failed");
  }
  if (budgetExceeded) {
    adjudication.preconditionsOk = false;
    adjudication.verdict = "inconclusive";
    adjudication.reasons.unshift("pack budget exceeded before completion");
  }

  const verificationVerdict: VerificationVerdict = {
    attemptId,
    oracleVersion: adjudication.oracleVersion,
    baseline: adjudication.baseline,
    securityCheck: adjudication.securityCheck,
    verdict: adjudication.verdict,
  };

  return {
    attemptId,
    startedAt,
    completedAt,
    expectedRevision: options.expectedRevision,
    observedRevision: meta.revisionEcho ?? health.revisionEcho,
    observedFixtureVersion: fixtureVersionOf(meta.body),
    requestCount,
    durationMs: Date.now() - startMs,
    budgetExceeded,
    setupOk,
    exchanges,
    ownEvidence: selectEvidenceFields(ownInvoice),
    crossEvidence: selectEvidenceFields(crossInvoice),
    adjudication,
    verificationVerdict,
  };
}

function isAliceWhoami(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  const actor = (body as Record<string, unknown>)["actor"];
  if (typeof actor !== "object" || actor === null) return false;
  const record = actor as Record<string, unknown>;
  return (
    record["userId"] === TRUSTED_ACTORS.alice.userId &&
    record["tenantId"] === TRUSTED_ACTORS.alice.tenantId &&
    record["label"] === TRUSTED_ACTORS.alice.label
  );
}

/** Opaque per-attempt nonce (hex, contract `AttemptNonce` shape). */
export function generateAttemptNonce(): string {
  return randomBytes(16).toString("hex");
}

export interface SandboxResultContext {
  runnerId: string;
  nonce: string;
}

/**
 * Normalize a pack run into a contract `SandboxResult` for the controller
 * (L16). Only GET exchanges are included — the setup login POST is pack
 * setup, not a `permittedMethods` test action, and the contract exchange
 * shape is GET-only by construction. No secrets: exchanges carry no
 * headers, excerpts are pre-sanitized, and the credential reference names
 * `ref:synthetic:alice` without ever holding the value.
 */
export function toSandboxResult(run: PackRunResult, context: SandboxResultContext): SandboxResult {
  const getExchanges = run.exchanges
    .filter((exchange) => exchange.method === "GET")
    .map((exchange) => ({
      method: "GET" as const,
      path: exchange.path,
      status: exchange.status,
      bodyHash: exchange.bodyHash,
      bodyExcerptRedacted: exchange.bodyExcerptRedacted,
    }));
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    attemptId: run.attemptId,
    runnerId: RunnerInstanceIdSchema.parse(context.runnerId),
    nonce: AttemptNonceSchema.parse(context.nonce),
    status: run.budgetExceeded ? "timeout" : "completed",
    exitCode: run.budgetExceeded ? null : 0,
    baselineAssertion: {
      passed: run.adjudication.baseline === "pass",
      detail:
        run.adjudication.reasons.find((reason) => reason.startsWith("P1")) ?? "P1 not observed",
    },
    negativeAssertion: {
      passed: run.adjudication.securityCheck === "pass",
      detail:
        run.adjudication.reasons.find((reason) => reason.startsWith("S1")) ?? "S1 not observed",
    },
    exchanges: getExchanges,
    observedFixtureOwner:
      run.adjudication.verdict === "reproduced"
        ? "bob"
        : run.adjudication.baseline === "pass"
          ? "alice"
          : "none",
    resourceUsage: {
      wallMs: run.durationMs,
      maxRssMb: null,
      requestsMade: run.requestCount,
    },
    containmentEventIds: [],
    artifactDigests: [],
    completedAt: run.completedAt,
  };
}

export { SESSION_COOKIE_NAME };
