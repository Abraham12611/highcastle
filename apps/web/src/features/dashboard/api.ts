import { headers } from "next/headers";
import { z } from "zod";
import {
  AuthorizationScopeSchema,
  EnvironmentSchema,
  FindingSchema,
  PreflightResponseSchema,
  ProjectSchema,
  ScanSummarySchema,
  TargetSchema,
  WorkspaceIdSchema,
} from "@highcastle/contracts";

/**
 * Typed adapter for Engineer 2's BFF (`/api/v1/*`, lane L18).
 *
 * The integrated routes call these functions with real `fetch` and render
 * honest states on failure — an unreachable or unimplemented API reads as a
 * failed state with retry, never as fabricated data. The ONLY synthetic
 * inputs in this package live in `fixtures.ts` and are consumed exclusively
 * by tests and the offline gallery script.
 */

export class DashboardApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly requestId: string | undefined;

  constructor(status: number, message: string, code?: string, requestId?: string) {
    super(message);
    this.name = "DashboardApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }

  get isUnauthorized(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
  }),
});

const DataEnvelopeSchema = z.object({
  data: z.unknown(),
});

/** Workspace summary shape (BFF-owned; display fields pinned, rest ignored). */
export const WorkspaceSummarySchema = z
  .object({
    id: WorkspaceIdSchema,
    slug: z.string().min(1),
    name: z.string().min(1),
  })
  .catchall(z.unknown());

export type WorkspaceSummary = z.infer<typeof WorkspaceSummarySchema>;

function baseFromEnv(): string | null {
  const url = process.env["HIGHCASTLE_APP_URL"];
  return url && url.length > 0 ? url.replace(/\/$/, "") : null;
}

/** Resolve the same-origin API base for server-side fetches. */
export async function getApiBase(): Promise<string> {
  const fromEnv = baseFromEnv();
  if (fromEnv) return fromEnv;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "127.0.0.1:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export interface FetchLike {
  (input: string, init?: RequestInit): Promise<Response>;
}

async function apiGet<T>(
  fetchFn: FetchLike,
  baseUrl: string,
  path: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  cookieHeader?: string | null,
): Promise<T> {
  let response: Response;
  try {
    response = await fetchFn(
      `${baseUrl}${path}`,
      cookieHeader
        ? { headers: { cookie: cookieHeader }, cache: "no-store" }
        : { cache: "no-store" },
    );
  } catch {
    throw new DashboardApiError(0, "The HighCastle API is unreachable from the dashboard server.");
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const parsed = ErrorEnvelopeSchema.safeParse(body);
    throw new DashboardApiError(
      response.status,
      parsed.success ? parsed.data.error.message : `Request failed (${response.status}).`,
      parsed.success ? parsed.data.error.code : undefined,
      parsed.success ? parsed.data.error.requestId : undefined,
    );
  }
  const envelope = DataEnvelopeSchema.safeParse(body);
  if (!envelope.success) {
    throw new DashboardApiError(502, "The API returned a response the dashboard cannot read.");
  }
  const parsed = schema.safeParse(envelope.data.data);
  if (!parsed.success) {
    throw new DashboardApiError(502, "The API returned data the dashboard cannot read.");
  }
  return parsed.data;
}

export interface ServerFetchOptions {
  baseUrl: string;
  cookieHeader?: string | null;
}

/** List workspaces visible to the current session. */
export async function getWorkspaces(
  fetchFn: FetchLike,
  options: ServerFetchOptions,
): Promise<WorkspaceSummary[]> {
  return apiGet(
    fetchFn,
    options.baseUrl,
    "/api/v1/workspaces",
    z.array(WorkspaceSummarySchema),
    options.cookieHeader,
  );
}

/** List projects in a workspace (workspace-scoped read). */
export async function getProjects(
  fetchFn: FetchLike,
  options: ServerFetchOptions,
  workspaceId: string,
): Promise<z.infer<typeof ProjectSchema>[]> {
  return apiGet(
    fetchFn,
    options.baseUrl,
    `/api/v1/workspaces/${workspaceId}/projects`,
    z.array(ProjectSchema),
    options.cookieHeader,
  );
}

/** Read one project (unknown IDs read as not-found, never leaked). */
export async function getProject(
  fetchFn: FetchLike,
  options: ServerFetchOptions,
  projectId: string,
): Promise<z.infer<typeof ProjectSchema>> {
  return apiGet(
    fetchFn,
    options.baseUrl,
    `/api/v1/projects/${projectId}`,
    ProjectSchema,
    options.cookieHeader,
  );
}

export type ScanSummary = z.output<typeof ScanSummarySchema>;
export type Finding = z.output<typeof FindingSchema>;
export type Project = z.output<typeof ProjectSchema>;
export type Target = z.output<typeof TargetSchema>;
export type Environment = z.output<typeof EnvironmentSchema>;
export type AuthorizationScope = z.output<typeof AuthorizationScopeSchema>;
export type Preflight = z.output<typeof PreflightResponseSchema>;

/** Recent scans for a project (newest first per API contract). */
export async function getProjectScans(
  fetchFn: FetchLike,
  options: ServerFetchOptions,
  projectId: string,
): Promise<ScanSummary[]> {
  return apiGet(
    fetchFn,
    options.baseUrl,
    `/api/v1/projects/${projectId}/scans`,
    z.array(ScanSummarySchema),
    options.cookieHeader,
  );
}

/** Findings for a project. */
export async function getProjectFindings(
  fetchFn: FetchLike,
  options: ServerFetchOptions,
  projectId: string,
): Promise<Finding[]> {
  return apiGet(
    fetchFn,
    options.baseUrl,
    `/api/v1/projects/${projectId}/findings`,
    z.array(FindingSchema),
    options.cookieHeader,
  );
}

/** Targets registered for a project. */
export async function getProjectTargets(
  fetchFn: FetchLike,
  options: ServerFetchOptions,
  projectId: string,
): Promise<z.infer<typeof TargetSchema>[]> {
  return apiGet(
    fetchFn,
    options.baseUrl,
    `/api/v1/projects/${projectId}/targets`,
    z.array(TargetSchema),
    options.cookieHeader,
  );
}

/** Environments for a project (demo twins + staging). */
export async function getProjectEnvironments(
  fetchFn: FetchLike,
  options: ServerFetchOptions,
  projectId: string,
): Promise<z.infer<typeof EnvironmentSchema>[]> {
  return apiGet(
    fetchFn,
    options.baseUrl,
    `/api/v1/projects/${projectId}/environments`,
    z.array(EnvironmentSchema),
    options.cookieHeader,
  );
}

/** Currently applicable authorization scope for a project. */
export async function getCurrentScope(
  fetchFn: FetchLike,
  options: ServerFetchOptions,
  projectId: string,
): Promise<z.infer<typeof AuthorizationScopeSchema> | null> {
  try {
    return await apiGet(
      fetchFn,
      options.baseUrl,
      `/api/v1/projects/${projectId}/authorization-scopes/current`,
      AuthorizationScopeSchema,
      options.cookieHeader,
    );
  } catch (error) {
    if (error instanceof DashboardApiError && error.status === 404) return null;
    throw error;
  }
}

/** Launch readiness preflight for a project. */
export async function getPreflight(
  fetchFn: FetchLike,
  options: ServerFetchOptions,
  projectId: string,
): Promise<z.infer<typeof PreflightResponseSchema>> {
  return apiGet(
    fetchFn,
    options.baseUrl,
    `/api/v1/projects/${projectId}/preflight`,
    PreflightResponseSchema,
    options.cookieHeader,
  );
}

// --- Honest derived summaries (counts only — never scores) ---

export interface ScanCounts {
  total: number;
  active: number;
  completed: number;
  failed: number;
}

const ACTIVE_SCAN_STATUSES = new Set([
  "queued",
  "preparing",
  "recon",
  "planning",
  "executing",
  "verifying",
  "finalizing",
]);

/** Count scans by lifecycle bucket from real scan rows. */
export function summarizeScans(scans: ScanSummary[]): ScanCounts {
  let active = 0;
  let completed = 0;
  let failed = 0;
  for (const scan of scans) {
    if (ACTIVE_SCAN_STATUSES.has(scan.status)) active += 1;
    else if (scan.status === "completed" || scan.status === "partial") completed += 1;
    else if (scan.status === "failed" || scan.status === "canceled") failed += 1;
  }
  return { total: scans.length, active, completed, failed };
}

export interface FindingCounts {
  total: number;
  confirmedByExecution: number;
  open: number;
  verifiedFixed: number;
}

const OPEN_REMEDIATION = new Set(["open", "in_progress", "pending_verification", "reopened"]);

/** Count findings by evidence axis and remediation position. */
export function summarizeFindings(findings: Finding[]): FindingCounts {
  let confirmedByExecution = 0;
  let open = 0;
  let verifiedFixed = 0;
  for (const finding of findings) {
    if (finding.confidence === "confirmed_by_execution") confirmedByExecution += 1;
    if (OPEN_REMEDIATION.has(finding.remediationStatus)) open += 1;
    if (finding.remediationStatus === "verified_fixed") verifiedFixed += 1;
  }
  return { total: findings.length, confirmedByExecution, open, verifiedFixed };
}
