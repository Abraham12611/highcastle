import type { DbExecutor } from "../client.js";
import { auditEvents } from "../schema/tables.js";
import { DbError } from "../errors.js";

/**
 * Append-only audit trail. There is intentionally no update or delete API:
 * corrections are new rows, retention is a documented operator decision.
 */
export interface RecordAuditInput {
  workspaceId?: string | null;
  actorUserId?: string | null;
  actorType: "user" | "model" | "worker" | "policy" | "runner" | "oracle" | "operator" | "system";
  action: string;
  entityType: string;
  entityId: string;
  policyHash?: string | null;
  redactedDetails?: Record<string, string | number | boolean>;
}

export async function recordAuditEvent(db: DbExecutor, input: RecordAuditInput) {
  const [row] = await db
    .insert(auditEvents)
    .values({
      workspaceId: input.workspaceId ?? null,
      actorUserId: input.actorUserId ?? null,
      actorType: input.actorType,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      policyHash: input.policyHash ?? null,
      redactedDetails: input.redactedDetails ?? {},
    })
    .returning();
  if (!row) throw new DbError("internal", "audit insert returned no row");
  return row;
}
