import type { DbExecutor } from "@highcastle/db";
import {
  getAttempt,
  getLatestExplanationForAttempt,
  getScan,
} from "@highcastle/db";
import { authorizeProject, requestWorkspace } from "@/server/authz";
import type { Session } from "@/server/session";

/**
 * Explanation-read seams (Engineer 8, issue #55). Interfaces mirror the
 * tenant-scoped readers structurally so the handler test can bind fakes;
 * the route binds the real L02 repos and L05/L04 authorization. The swap
 * is mechanical and the production path has no fake store.
 */

export interface AttemptRecord {
  id: string;
  scanId: string;
}

export interface ScanRecord {
  projectId: string;
}

export interface ExplanationRow {
  attemptId: string;
  oracleVerdict: "reproduced" | "not_reproduced" | "inconclusive";
  replayVerdict: "verified_fixed" | "still_vulnerable" | "regression" | "inconclusive" | null;
  explanation: unknown;
  requestedModel: string;
  responseModel: string | null;
  requestId: string | null;
  latencyMs: number | null;
  errorCode: string | null;
}

export interface ExplanationReader {
  getAttempt(db: DbExecutor, workspaceId: string, attemptId: string): Promise<AttemptRecord | null>;
  getScan(db: DbExecutor, workspaceId: string, scanId: string): Promise<ScanRecord | null>;
  getLatestExplanation(
    db: DbExecutor,
    input: { workspaceId: string; scanId: string; attemptId: string },
  ): Promise<ExplanationRow | null>;
}

export interface ExplanationAuthorizer {
  requestWorkspace(db: DbExecutor, session: Session): Promise<string>;
  authorizeProject(
    db: DbExecutor,
    session: Session,
    workspaceId: string,
    projectId: string,
  ): Promise<unknown>;
}

export interface ExplanationDeps {
  reader: ExplanationReader;
  authorizer: ExplanationAuthorizer;
}

/** Production binding: real L02 readers + real workspace/project authorization. */
export function liveDeps(): ExplanationDeps {
  return {
    reader: { getAttempt, getScan, getLatestExplanation: getLatestExplanationForAttempt },
    authorizer: { requestWorkspace, authorizeProject },
  };
}
