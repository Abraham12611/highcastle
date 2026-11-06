/**
 * Deterministic synthetic fixtures for the HighCastle target-lab.
 *
 * CANONICAL CONTRACT (frozen for L03/L15):
 *   alice -> user_A / tenant_A owns invoice_A
 *   bob   -> user_B / tenant_B owns invoice_B
 *
 * All identifiers and payloads below are fabricated. Emails use the reserved
 * `.test` TLD (RFC 2606). No real customer data exists anywhere in this app.
 *
 * SECURITY: FIXTURE_TOKENS are lab-only test credentials. They are documented
 * in README.md for the test pack but are NEVER returned by any API endpoint,
 * so the unauthenticated boundary remains meaningful even on the vulnerable
 * revision.
 */

import type { Actor, Invoice } from "./types.ts";

export const FIXTURE_VERSION = "lab-fixtures-1.0.0" as const;

export const SESSION_COOKIE = "lab_session" as const;

export const TENANTS = {
  tenant_A: { id: "tenant_A", name: "Acme Synthetic North (fixture)" },
  tenant_B: { id: "tenant_B", name: "Acme Synthetic South (fixture)" },
} as const;

export const ACTORS: Record<"alice" | "bob", Actor> = {
  alice: { userId: "user_A", tenantId: "tenant_A", label: "alice" },
  bob: { userId: "user_B", tenantId: "tenant_B", label: "bob" },
};

/**
 * Lab-only fixture bearer tokens -> fixture actor. Deterministic by design:
 * the security test pack authenticates with these exact values.
 */
export const FIXTURE_TOKENS: Readonly<Record<string, Actor>> = {
  "lab-token-alice": ACTORS.alice,
  "lab-token-bob": ACTORS.bob,
};

/**
 * Deterministic session identifiers issued by POST /api/auth/login. No random
 * state: the same token always yields the same session value.
 */
export function sessionIdFor(actor: Actor): string {
  return `lab-session-${actor.userId}`;
}

const SESSION_TO_ACTOR: Readonly<Record<string, Actor>> = Object.fromEntries(
  Object.values(ACTORS).map((actor) => [sessionIdFor(actor), actor]),
);

export function actorForToken(token: string): Actor | null {
  return FIXTURE_TOKENS[token] ?? null;
}

export function actorForSession(sessionId: string): Actor | null {
  return SESSION_TO_ACTOR[sessionId] ?? null;
}

function seedInvoices(): Invoice[] {
  return [
    {
      id: "invoice_A",
      number: "INV-2026-0001",
      tenantId: "tenant_A",
      ownerId: "user_A",
      customer: { name: "Alice Fixture", email: "alice@targetlab.test" },
      currency: "USD",
      amountCents: 129_900,
      status: "open",
      issuedAt: "2026-10-01T00:00:00.000Z",
      dueAt: "2026-10-31T00:00:00.000Z",
      lines: [
        { description: "Synthetic consulting services (fixture)", quantity: 12, unitAmountCents: 10_000 },
        { description: "Synthetic lab usage fee (fixture)", quantity: 1, unitAmountCents: 9_900 },
      ],
    },
    {
      id: "invoice_B",
      number: "INV-2026-0002",
      tenantId: "tenant_B",
      ownerId: "user_B",
      customer: { name: "Bob Fixture", email: "bob@targetlab.test" },
      currency: "USD",
      amountCents: 54_250,
      status: "open",
      issuedAt: "2026-10-02T00:00:00.000Z",
      dueAt: "2026-11-01T00:00:00.000Z",
      lines: [
        { description: "Synthetic subscription, tier B (fixture)", quantity: 5, unitAmountCents: 10_850 },
      ],
    },
  ];
}

/**
 * In-memory fixture store. `reset()` restores the canonical seed byte-for-byte
 * so every attempt/replay observes identical data.
 */
export class FixtureStore {
  private invoices = new Map<string, Invoice>();

  constructor() {
    this.reset();
  }

  reset(): void {
    this.invoices.clear();
    for (const invoice of seedInvoices()) {
      this.invoices.set(invoice.id, structuredClone(invoice));
    }
  }

  count(): number {
    return this.invoices.size;
  }

  /** Vulnerable lookup path: identity by id alone, no tenant predicate. */
  findById(id: string): Invoice | undefined {
    return this.invoices.get(id);
  }

  /** Patched lookup path: invoice must belong to the actor's tenant. */
  findByIdForTenant(id: string, tenantId: string): Invoice | undefined {
    const invoice = this.invoices.get(id);
    return invoice && invoice.tenantId === tenantId ? invoice : undefined;
  }
}
