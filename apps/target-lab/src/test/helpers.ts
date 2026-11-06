/**
 * Test helpers: boot the real HTTP listener on an ephemeral loopback port and
 * exercise it with real fetch() calls. No mocks — these tests observe actual
 * wire behavior for both lab revisions.
 */

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createRequestListener } from "../app.ts";
import type { LabRevision } from "../types.ts";

export const ALICE_TOKEN = "lab-token-alice";
export const BOB_TOKEN = "lab-token-bob";

export interface RunningLab {
  baseUrl: string;
  close: () => Promise<void>;
}

export async function startLab(revision: LabRevision): Promise<RunningLab> {
  const server: Server = createServer(createRequestListener({ revision }));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

export interface InvoiceBody {
  invoice: {
    id: string;
    number: string;
    tenantId: string;
    ownerId: string;
    customer: { name: string; email: string };
    currency: string;
    amountCents: number;
    status: string;
    issuedAt: string;
    dueAt: string;
    lines: { description: string; quantity: number; unitAmountCents: number }[];
  };
  meta: { revision: string; requestId: string };
}

export interface ErrorBody {
  error: { code: string; message: string };
  meta: { revision: string; requestId: string };
}
