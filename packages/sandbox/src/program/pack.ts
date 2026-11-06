/**
 * `bola-invoice-v1` runner program — the ONLY executable pack for H.
 *
 * Implements the fixed assertion sequence from
 * docs/agents/02_TEST_PACK_AND_VERIFICATION.md against the synthetic lab:
 *
 *   P0  GET /api/meta            — lab reachable, fixture/revision well-formed
 *   ID  GET /api/auth/whoami     — actor identity resolves to Alice (user_A)
 *   P1  GET /api/invoices/invoice_A — baseline: own invoice readable
 *   S1  GET /api/invoices/invoice_B — security: cross-account read
 *
 * Everything is GET-only (permittedMethods) over exactly four requests —
 * inside the manifest budget of 8 and any tighter request limit. The program
 * emits assertion/exchange evidence; the independent oracle (L15) turns it
 * into a verdict. This program NEVER decides "confirmed"; it records what the
 * lab actually answered.
 *
 * L15 coordination note: the pack semantics are frozen by the doc and the
 * SandboxResult contract. If L15 implements the pack in packages/test-packs,
 * this program stays as the in-image executor of that same contract.
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

export interface PackOutcome {
  exchanges: PackExchange[];
  baselineAssertion: AssertionEvidence;
  negativeAssertion: AssertionEvidence;
  preconditionPassed: boolean;
  observedFixtureOwner: "alice" | "bob" | "none";
  requestsMade: number;
  /** Non-null when the pack itself could not run to completion. */
  fatalError: string | null;
}

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

/**
 * Mirror of TEST_PACK_MANIFEST["bola-invoice-v1"].maxRequests. Kept as a local
 * constant because the runner image has no @highcastle/contracts at runtime —
 * program files may use `import type` only. A unit test (pack.test.ts) pins
 * this value to the manifest so drift fails CI.
 */
export const PACK_MAX_REQUESTS = 8;

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
  let preconditionPassed = false;
  let observedFixtureOwner: "alice" | "bob" | "none" = "none";
  let fatalError: string | null = null;

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

  // --- P0: lab meta reachable + fixture set is the canonical one ---
  const meta = await step("/api/meta");
  if (meta === null || meta.status !== 200) {
    emitAssertion(
      "precondition_meta",
      assertion(false, `GET /api/meta -> ${meta === null ? fatalError : `HTTP ${meta.status}`}`),
    );
    return finish(
      assertion(false, "precondition failed: lab meta unreachable"),
      assertion(false, "not executed"),
    );
  }
  let fixtureOk = false;
  try {
    const parsed = JSON.parse(meta.body) as { fixtureSet?: unknown; revision?: unknown };
    fixtureOk = parsed.fixtureSet === "alice-bob-invoices" && typeof parsed.revision === "string";
  } catch {
    fixtureOk = false;
  }
  preconditionPassed = fixtureOk;
  emitAssertion(
    "precondition_meta",
    assertion(
      fixtureOk,
      fixtureOk
        ? "lab meta reports canonical alice-bob-invoices fixture set"
        : "lab meta missing canonical fixtureSet/revision",
    ),
  );
  if (!fixtureOk) {
    return finish(
      assertion(false, "precondition failed: unexpected fixture set"),
      assertion(false, "not executed"),
    );
  }

  // --- ID: bearer resolves to Alice (user_A / tenant_A) ---
  const whoami = await step("/api/auth/whoami");
  const whoamiActor = whoami !== null && whoami.status === 200 ? parseActor(whoami.body) : null;
  const identityOk = whoamiActor === "user_A";
  emitAssertion(
    "identity_alice",
    assertion(
      identityOk,
      whoami === null
        ? `whoami failed: ${fatalError}`
        : `whoami -> HTTP ${whoami.status}, actor=${whoamiActor ?? "unresolved"}`,
    ),
  );

  // --- P1: baseline own-invoice read ---
  const own = await step("/api/invoices/invoice_A");
  const ownInvoice = own !== null && own.status === 200 ? parseInvoice(own.body) : null;
  const baselinePass = ownInvoice?.ownerId === "user_A";
  const baseline = assertion(
    baselinePass,
    own === null
      ? `baseline request failed: ${fatalError}`
      : baselinePass
        ? "GET /api/invoices/invoice_A -> 200 with ownerId user_A"
        : `GET /api/invoices/invoice_A -> HTTP ${own.status}, ownerId=${String(ownInvoice?.ownerId ?? "none")}`,
  );
  emitAssertion("baseline_own_invoice", baseline);

  // --- S1: cross-account read of Bob's known invoice ---
  const cross = await step("/api/invoices/invoice_B");
  let negative: AssertionEvidence;
  if (cross === null) {
    negative = assertion(false, `cross-account request failed: ${fatalError}`);
  } else {
    const crossInvoice = cross.status === 200 ? parseInvoice(cross.body) : null;
    if (cross.status === 200 && crossInvoice?.ownerId === "user_B") {
      observedFixtureOwner = "bob";
      negative = assertion(
        false,
        "GET /api/invoices/invoice_B -> 200 returning Bob's invoice (ownerId user_B) under Alice's identity",
      );
    } else if (cross.status === 403 || cross.status === 404) {
      negative = assertion(
        true,
        `GET /api/invoices/invoice_B -> HTTP ${cross.status}: cross-account read denied`,
      );
    } else {
      negative = assertion(
        false,
        `GET /api/invoices/invoice_B -> ambiguous HTTP ${cross.status}; not a clean denial or a confirmed cross-read`,
      );
    }
  }
  emitAssertion("negative_cross_account", negative);
  return finish(baseline, negative);

  function finish(baseline: AssertionEvidence, negative: AssertionEvidence): PackOutcome {
    return {
      exchanges,
      baselineAssertion: baseline,
      negativeAssertion: negative,
      preconditionPassed,
      observedFixtureOwner,
      requestsMade,
      fatalError,
    };
  }
}

function parseActor(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { actor?: { userId?: unknown } };
    return typeof parsed.actor?.userId === "string" ? parsed.actor.userId : null;
  } catch {
    return null;
  }
}
