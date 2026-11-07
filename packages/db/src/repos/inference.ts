import { and, eq } from "drizzle-orm";
import type { DbExecutor } from "../client.js";
import { agentProposals, modelCalls, scans } from "../schema/tables.js";
import { DbError } from "../errors.js";

// --- Model calls (L12 writes; outcome recorded, never trusted) ---

export interface RecordModelCallInput {
  workspaceId: string;
  scanId: string;
  model: string;
  purpose: "hypothesis" | "test_plan" | "threat_model" | "remediation_guidance";
  requestId?: string | null;
  tokensInput?: number | null;
  tokensOutput?: number | null;
  latencyMs?: number | null;
  outcome: "success" | "malformed" | "policy_conflict" | "timeout" | "rate_limited" | "error";
  errorCode?: string | null;
}

export async function recordModelCall(db: DbExecutor, input: RecordModelCallInput) {
  const scan = await db
    .select({ id: scans.id })
    .from(scans)
    .where(and(eq(scans.id, input.scanId), eq(scans.workspaceId, input.workspaceId)))
    .limit(1);
  if (!scan[0]) throw DbError.notFound("scan", input.scanId);
  const [row] = await db
    .insert(modelCalls)
    .values({
      workspaceId: input.workspaceId,
      scanId: input.scanId,
      provider: "vultr",
      model: input.model,
      purpose: input.purpose,
      requestId: input.requestId ?? null,
      tokensInput: input.tokensInput ?? null,
      tokensOutput: input.tokensOutput ?? null,
      latencyMs: input.latencyMs ?? null,
      outcome: input.outcome,
      errorCode: input.errorCode ?? null,
    })
    .returning();
  if (!row) throw new DbError("internal", "model_call insert returned no row");
  return row;
}

// --- Agent proposals (model hypothesis + validated plan snapshot) ---

export interface RecordProposalInput {
  workspaceId: string;
  scanId: string;
  modelCallId: string;
  schemaVersion: number;
  rawProposalRedacted: unknown;
  structuredPlan?: Record<string, unknown> | null;
  validationStatus: "valid" | "invalid";
  rejectionCode?:
    | "schema_mismatch"
    | "unknown_pack"
    | "out_of_scope_pack"
    | "forbidden_field"
    | "stale_version"
    | "empty_proposal"
    | null;
  policyHash?: string | null;
}

export async function recordAgentProposal(db: DbExecutor, input: RecordProposalInput) {
  const [call] = await db
    .select({ id: modelCalls.id })
    .from(modelCalls)
    .where(
      and(
        eq(modelCalls.id, input.modelCallId),
        eq(modelCalls.workspaceId, input.workspaceId),
        eq(modelCalls.scanId, input.scanId),
      ),
    )
    .limit(1);
  if (!call) throw DbError.notFound("model_call", input.modelCallId);
  const [row] = await db
    .insert(agentProposals)
    .values({
      workspaceId: input.workspaceId,
      scanId: input.scanId,
      modelCallId: input.modelCallId,
      schemaVersion: input.schemaVersion,
      rawProposalRedacted: (input.rawProposalRedacted ?? {}) as Record<string, unknown>,
      structuredPlan: (input.structuredPlan ?? null) as Record<string, unknown> | null,
      validationStatus: input.validationStatus,
      rejectionCode: input.rejectionCode ?? null,
      policyHash: input.policyHash ?? null,
    })
    .returning();
  if (!row) throw new DbError("internal", "agent_proposal insert returned no row");
  return row;
}

export async function listAgentProposals(db: DbExecutor, workspaceId: string, scanId: string) {
  return db
    .select()
    .from(agentProposals)
    .where(and(eq(agentProposals.scanId, scanId), eq(agentProposals.workspaceId, workspaceId)));
}
