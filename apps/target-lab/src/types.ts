/**
 * HighCastle target-lab — owned synthetic invoice SaaS test target (L11).
 *
 * Type-level contract for the lab. Everything here is synthetic fixture data;
 * there is no database, no outbound network and no real customer information.
 */

export const LAB_REVISIONS = ["lab-v1-vulnerable", "lab-v2-patched"] as const;

export type LabRevision = (typeof LAB_REVISIONS)[number];

export function isLabRevision(value: unknown): value is LabRevision {
  return typeof value === "string" && (LAB_REVISIONS as readonly string[]).includes(value);
}

/** Deterministic actor identity mapped from a lab-only fixture credential. */
export interface Actor {
  userId: string;
  tenantId: string;
  label: "alice" | "bob";
}

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitAmountCents: number;
}

export interface Invoice {
  id: string;
  number: string;
  tenantId: string;
  ownerId: string;
  customer: { name: string; email: string };
  currency: "USD";
  amountCents: number;
  status: "open" | "paid" | "void";
  issuedAt: string;
  dueAt: string;
  lines: InvoiceLine[];
}

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "INVOICE_NOT_FOUND"
  | "INVALID_REQUEST"
  | "METHOD_NOT_ALLOWED"
  | "NOT_FOUND"
  | "INTERNAL";

export interface ResponseMeta {
  revision: LabRevision;
  requestId: string;
}
