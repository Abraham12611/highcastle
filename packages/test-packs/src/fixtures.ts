/**
 * Trusted fixture expectations for bola-invoice-v1 (L15-owned copy).
 *
 * Source of truth for LAB BEHAVIOR is Engineer 11's target-lab
 * (`apps/target-lab`, fixtures `alice-bob-invoices`, version `1.0.0`).
 * This module is the pack's pinned expectation of that lab: every field
 * below must match the lab's `/api/meta` manifest and invoice payloads, or
 * the oracle reports `inconclusive` (fixture drift) — never a silent pass.
 *
 * No value here is secret: fixture credential VALUES live only in the lab
 * and in the controller that resolves an opaque `CredentialRef`
 * (`ref:synthetic:<role>`). This package only names the reference.
 */

import { CredentialRefSchema } from "@highcastle/contracts";

export const TRUSTED_FIXTURE_VERSION = "1.0.0" as const;
export const TRUSTED_FIXTURE_SET = "alice-bob-invoices" as const;

/** Lab revisions the pack can execute against (L11 contract). */
export const TRUSTED_LAB_REVISIONS = ["lab-v1-vulnerable", "lab-v2-patched"] as const;

export type TrustedLabRevision = (typeof TRUSTED_LAB_REVISIONS)[number];

export function isTrustedLabRevision(value: unknown): value is TrustedLabRevision {
  return typeof value === "string" && (TRUSTED_LAB_REVISIONS as readonly string[]).includes(value);
}

export interface TrustedActor {
  userId: string;
  tenantId: string;
  label: "alice" | "bob";
}

export const TRUSTED_ACTORS = {
  alice: { userId: "user_A", tenantId: "tenant_A", label: "alice" },
  bob: { userId: "user_B", tenantId: "tenant_B", label: "bob" },
} as const satisfies Record<"alice" | "bob", TrustedActor>;

export interface TrustedInvoiceIdentity {
  id: string;
  ownerId: string;
  tenantId: string;
  number: string;
}

/** Known invoice IDs — the ONLY object IDs the pack may request. */
export const KNOWN_INVOICE_IDS = ["invoice_A", "invoice_B"] as const;

export type KnownInvoiceId = (typeof KNOWN_INVOICE_IDS)[number];

export const TRUSTED_INVOICES = {
  invoice_A: {
    id: "invoice_A",
    ownerId: "user_A",
    tenantId: "tenant_A",
    number: "INV-2026-0001",
  },
  invoice_B: {
    id: "invoice_B",
    ownerId: "user_B",
    tenantId: "tenant_B",
    number: "INV-2026-0002",
  },
} as const satisfies Record<KnownInvoiceId, TrustedInvoiceIdentity>;

/**
 * Opaque credential reference for a synthetic role, resolved to the real
 * lab-only fixture credential by the controller (L14/L16) — the secret value
 * never appears in pack code, contracts, or evidence.
 */
export function credentialRefFor(role: keyof typeof TRUSTED_ACTORS): string {
  return CredentialRefSchema.parse(`ref:synthetic:${role}`);
}
