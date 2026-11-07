/**
 * `bola-invoice-v1` runner program — the ONLY executable pack for H.
 *
 * Executes the fixed observation sequence from
 * docs/agents/02_TEST_PACK_AND_VERIFICATION.md against the synthetic lab:
 *
 *   P0  GET /api/meta            — exact revision, fixtureVersion 1.0.0,
 *                                  canonical fixture set and owner ids
 *   ID  GET /api/auth/whoami     — actor identity MUST resolve to Alice
 *   P1  GET /api/invoices/invoice_A — baseline: own invoice readable
 *   S1  GET /api/invoices/invoice_B — cross-account observation
 *
 * ORACLE BOUNDARY (coordinator review #1/#4): this program OBSERVES — it never
 * certifies a verdict. `baselineAssertion`/`negativeAssertion` are raw
 * evidence legs for L15's independent oracle, which alone assigns
 * reproduced / not_reproduced / inconclusive / verified_fixed.
 *
 * Hard preconditions (review #1): unless revision+fixtureVersion+fixture
 * owners are exact AND whoami reports user_A, the legs are marked
 * INCONCLUSIVE — a run under Bob's (or any non-Alice) credential can never
 * be read as "Alice exploited authorization", even on the vulnerable lab
 * where Bob can read both invoices.
 */

import { labGet, type LabResponse } from "./http.ts";
import { emit, nowIso, truncate } from "./util.ts";
import type { AssertionEvidence } from "@highcastle/contracts";

export interface PackExchange {
  method: "GET";
  path: string;
  status: number;
  bodyHash: string;
  bodyExcerptRedacted?: string;
}

/** Program-internal run validity — evidence for L15, not a verdict. */
export interface PackOutcome {
  exchanges: PackExchange[];
  baselineAssertion: AssertionEvidence;
  negativeAssertion: AssertionEvidence;
  /** True only when every hard precondition held (meta+identity). */
  preconditionsMet: boolean;
  /** Why the run is uninterpretable, when it is. */
  inconclusiveReason: string | null;
  observedFixtureOwner: "alice" | "bob" | "none";
  requestsMade: number;
  /** Non-null when the pack itself could not run to completion. */
  fatalError: string | null;
}

/**
 * Frozen expectations from docs/agents/02 + L11 fixtures. Verified against
 * live /api/meta — never inferred from lab content alone.
 */
export const EXPECTED = {
  revisions: ["lab-v1-vulnerable", "lab-v2-patched"] as const,
  fixtureVersion: "1.0.0",
  fixtureSet: "alice-bob-invoices",
  actorUserId: "user_A",
  actorTenantId: "tenant_A",
  ownInvoice: { id: "invoice_A", ownerId: "user_A", tenantId: "tenant_A" },
  otherInvoice: { id: "invoice_B", ownerId: "user_B", tenantId: "tenant_B" },
} as const;

/**
 * Mirror of TEST_PACK_MANIFEST["bola-invoice-v1"].maxRequests. Kept as a local
 * constant because the runner image has no @highcastle/contracts at runtime —
 * program files may use `import type` only. A unit test (pack.test.ts) pins
 * this value to the manifest so drift fails CI.
 */
export const PACK_MAX_REQUESTS = 8;

interface InvoiceBody {
  invoice?: { ownerId?: unknown; tenantId?: unknown; id?: unknown };
}

function parseInvoice(body: string): InvoiceBody["invoice"] | null {
  try {
    const parsed = JSON.parse(body) as InvoiceBody;
    return parsed.invoice ?? null;
  } catch {
    return null;
  }
}

function assertion(passed: boolean, detail: string): AssertionEvidence {
  return { passed, detail: truncate(detail, 500) };
}

function inconclusive(detail: string): AssertionEvidence {
  return assertion(false, `inconclusive: ${detail}`);
}

interface MetaPayload {
  revision?: unknown;
  fixtureVersion?: unknown;
  fixtureSet?: unknown;
  fixtures?: {
    invoices?: { id?: unknown; ownerId?: unknown; tenantId?: unknown }[];
  };
}

/** Validate /api/meta against the frozen fixture contract. Returns a reason or null. */
export function validateLabMeta(body: string): string | null {
  let meta: MetaPayload;
  try {
    meta = JSON.parse(body) as MetaPayload;
  } catch {
    return "lab meta is not valid JSON";
  }
  if (
    typeof meta.revision !== "string" ||
    !(EXPECTED.revisions as readonly string[]).includes(meta.revision)
  ) {
    return `unexpected lab revision ${JSON.stringify(meta.revision)}`;
  }
  if (meta.fixtureVersion !== EXPECTED.fixtureVersion) {
    return `unexpected fixtureVersion ${JSON.stringify(meta.fixtureVersion)}`;
  }
  if (meta.fixtureSet !== EXPECTED.fixtureSet) {
    return `unexpected fixtureSet ${JSON.stringify(meta.fixtureSet)}`;
  }
  const invoices = Array.isArray(meta.fixtures?.invoices) ? meta.fixtures.invoices : [];
  for (const expected of [EXPECTED.ownInvoice, EXPECTED.otherInvoice]) {
    const found = invoices.find((i) => i.id === expected.id);
    if (!found || found.ownerId !== expected.ownerId || found.tenantId !== expected.tenantId) {
      return `fixture ${expected.id} does not report expected owner ${expected.ownerId}/${expected.tenantId}`;
    }
  }
  return null;
}

/**
 * Execute the pack. `labGetFn` is injectable ONLY so unit tests can supply a
 * local stub server — the production path uses the allowlisted client and the
 * fixed paths below; neither can be influenced by the request or the model.
 */
export async function runBolaInvoiceV1(
  labOrigin: string,
  bearerToken: string,
  maxRequests: number,
  labGetFn: typeof labGet = labGet,
): Promise<PackOutcome> {
  const exchanges: PackExchange[] = [];
  let requestsMade = 0;
  let observedFixtureOwner: "alice" | "bob" | "none" = "none";
  let fatalError: string | null = null;
  let inconclusiveReason: string | null = null;

  const budget = Math.min(maxRequests, PACK_MAX_REQUESTS);

  async function step(path: string): Promise<LabResponse | null> {
    if (requestsMade >= budget) {
      fatalError = `request budget exhausted (${budget})`;
      return null;
    }
    requestsMade += 1;
    try {
      const res = await labGetFn(labOrigin, path, bearerToken);
      const exchange: PackExchange = {
        method: "GET",
        path,
        status: res.status,
        bodyHash: res.bodyHash,
      };
      if (res.bodyExcerptRedacted !== "") {
        exchange.bodyExcerptRedacted = res.bodyExcerptRedacted;
      }
      exchanges.push(exchange);
      emit({
        v: 1,
        type: "exchange",
        at: nowIso(),
        exchange: {
          method: exchange.method,
          path: exchange.path,
          status: exchange.status,
          bodyHash: exchange.bodyHash,
          ...(exchange.bodyExcerptRedacted !== undefined
            ? { bodyExcerptRedacted: exchange.bodyExcerptRedacted }
            : {}),
        },
      });
      return res;
    } catch (err) {
      fatalError = `GET ${path} failed: ${err instanceof Error ? err.message : String(err)}`;
      return null;
    }
  }

  function emitAssertion(name: string, ev: AssertionEvidence): void {
    emit({ v: 1, type: "assertion", at: nowIso(), name, passed: ev.passed, detail: ev.detail });
  }

  function finish(baseline: AssertionEvidence, negative: AssertionEvidence): PackOutcome {
    return {
      exchanges,
      baselineAssertion: baseline,
      negativeAssertion: negative,
      preconditionsMet: inconclusiveReason === null,
      inconclusiveReason,
      observedFixtureOwner,
      requestsMade,
      fatalError,
    };
  }

  // --- P0: lab meta must exactly match the frozen fixture contract ---
  const meta = await step("/api/meta");
  if (meta === null || meta.status !== 200) {
    inconclusiveReason = `lab meta unreachable (HTTP ${meta?.status ?? "request failed"})`;
    emitAssertion("precondition_meta", inconclusive(inconclusiveReason));
    return finish(inconclusive(inconclusiveReason), inconclusive(inconclusiveReason));
  }
  const metaError = validateLabMeta(meta.body);
  emitAssertion(
    "precondition_meta",
    metaError === null
      ? assertion(true, "lab meta matches frozen revision/fixture/owners contract")
      : inconclusive(metaError),
  );
  if (metaError !== null) {
    inconclusiveReason = metaError;
    return finish(inconclusive(metaError), inconclusive(metaError));
  }

  // --- ID: credential MUST resolve to Alice (user_A / tenant_A) ---
  const whoami = await step("/api/auth/whoami");
  const whoamiActor = whoami !== null && whoami.status === 200 ? parseActor(whoami.body) : null;
  const whoamiTenant =
    whoami !== null && whoami.status === 200 ? parseActorTenant(whoami.body) : null;
  const identityOk =
    whoamiActor === EXPECTED.actorUserId && whoamiTenant === EXPECTED.actorTenantId;
  emitAssertion(
    "precondition_identity",
    identityOk
      ? assertion(true, "actor identity verified as user_A/tenant_A (alice)")
      : inconclusive(
          `actor identity is ${whoamiActor ?? "unresolved"}/${whoamiTenant ?? "unresolved"}, ` +
            `expected ${EXPECTED.actorUserId}/${EXPECTED.actorTenantId}`,
        ),
  );
  if (!identityOk) {
    inconclusiveReason =
      `actor identity is ${whoamiActor ?? "unresolved"}, not ${EXPECTED.actorUserId} — ` +
      "results cannot be attributed to Alice";
    return finish(inconclusive(inconclusiveReason), inconclusive(inconclusiveReason));
  }

  // --- P1: baseline own-invoice read (prerequisite for ANY interpretation) ---
  const own = await step("/api/invoices/invoice_A");
  const ownInvoice = own !== null && own.status === 200 ? parseInvoice(own.body) : null;
  const baselinePass =
    ownInvoice?.ownerId === EXPECTED.ownInvoice.ownerId &&
    ownInvoice?.tenantId === EXPECTED.ownInvoice.tenantId;
  const baseline = assertion(
    baselinePass,
    own === null
      ? `baseline request failed: ${fatalError}`
      : baselinePass
        ? `GET /api/invoices/invoice_A -> 200 with ownerId ${EXPECTED.ownInvoice.ownerId}`
        : `inconclusive: baseline read -> HTTP ${own.status}, ownerId=${String(ownInvoice?.ownerId ?? "none")}`,
  );
  emitAssertion("baseline_own_invoice", baseline);
  if (!baselinePass) {
    inconclusiveReason = "baseline own-invoice read did not succeed — no valid run";
    return finish(baseline, inconclusive(inconclusiveReason));
  }

  // --- S1: cross-account read of Bob's known invoice ---
  const cross = await step("/api/invoices/invoice_B");
  let negative: AssertionEvidence;
  if (cross === null) {
    negative = inconclusive(`cross-account request failed: ${fatalError}`);
  } else {
    const crossInvoice = cross.status === 200 ? parseInvoice(cross.body) : null;
    if (cross.status === 200 && crossInvoice?.ownerId === EXPECTED.otherInvoice.ownerId) {
      observedFixtureOwner = "bob";
      // Observation only: cross-account data returned. L15's oracle decides
      // whether this confirms the vulnerability.
      negative = assertion(
        false,
        `GET /api/invoices/invoice_B -> 200 returning invoice owned by ${EXPECTED.otherInvoice.ownerId} under Alice's verified identity`,
      );
    } else if (cross.status === 403 || cross.status === 404) {
      negative = assertion(
        true,
        `GET /api/invoices/invoice_B -> HTTP ${cross.status}: cross-account read denied`,
      );
    } else {
      negative = inconclusive(
        `cross-account read -> ambiguous HTTP ${cross.status}; not a clean denial or a confirmed cross-read`,
      );
    }
  }
  emitAssertion("negative_cross_account", negative);
  return finish(baseline, negative);
}

function parseActor(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { actor?: { userId?: unknown } };
    return typeof parsed.actor?.userId === "string" ? parsed.actor.userId : null;
  } catch {
    return null;
  }
}

function parseActorTenant(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { actor?: { tenantId?: unknown } };
    return typeof parsed.actor?.tenantId === "string" ? parsed.actor.tenantId : null;
  } catch {
    return null;
  }
}
