import {
  CreateScanRequestSchema,
  CreateScanResponseSchema,
  ScanSummarySchema,
  type CreateScanRequest,
  type CreateScanResponse,
  type ScanSummary,
} from "@highcastle/contracts";

/**
 * Typed client for the L18 BFF scan endpoints.
 *
 * Endpoint map (documented for integration):
 * - POST   /api/v1/projects/:projectId/scans          → 202 CreateScanResponse
 * - GET    /api/v1/scans/:scanId                      → ScanSummary
 * - POST   /api/v1/scans/:scanId/cancel               → 202 {status:"cancel_requested"}
 * - GET    /api/v1/scans/:scanId/stream               → SSE (L17, existing)
 * - GET    /api/v1/projects/:projectId/assessment-context → AssessmentContext
 *
 * The last two paths are the integration surface this feature needs; if the
 * deployed route differs, change only this module — components never build
 * URLs themselves.
 */

export interface ApiFailure {
  code: string;
  message: string;
  status: number;
  requestId?: string;
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiFailure };

async function request<T>(
  input: string,
  init: RequestInit,
  parse: (v: unknown) => T | null,
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(input, { ...init, credentials: "same-origin" });
  } catch {
    return {
      ok: false,
      error: { code: "network", message: "network error", status: 0 },
    };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    const env = (body ?? {}) as { error?: { code?: string; message?: string }; requestId?: string };
    const failure: ApiFailure = {
      code: env.error?.code ?? `http_${res.status}`,
      message: env.error?.message ?? `Request failed (${res.status})`,
      status: res.status,
      ...(env.requestId !== undefined ? { requestId: env.requestId } : {}),
    };
    return { ok: false, error: failure };
  }
  const data = parse(body);
  if (data === null) {
    return {
      ok: false,
      error: {
        code: "contract_mismatch",
        message: "response did not match the expected contract",
        status: res.status,
      },
    };
  }
  return { ok: true, data };
}

export function createScan(
  projectId: string,
  body: CreateScanRequest,
  idempotencyKey: string,
): Promise<ApiResult<CreateScanResponse>> {
  return request(
    `/api/v1/projects/${projectId}/scans`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify(CreateScanRequestSchema.parse(body)),
    },
    (v) => {
      const r = CreateScanResponseSchema.safeParse(v);
      return r.success ? r.data : null;
    },
  );
}

export function getScanSummary(
  scanId: string,
): Promise<ApiResult<ScanSummary>> {
  return request(`/api/v1/scans/${scanId}`, { method: "GET" }, (v) => {
    const r = ScanSummarySchema.safeParse(v);
    return r.success ? r.data : null;
  });
}

export function cancelScan(
  scanId: string,
): Promise<ApiResult<{ status: string }>> {
  return request(
    `/api/v1/scans/${scanId}/cancel`,
    { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
    (v) =>
      typeof v === "object" && v !== null && "status" in v
        ? { status: String((v as Record<string, unknown>).status) }
        : { status: "cancel_requested" },
  );
}

/** What the wizard needs: the single authorized target + environment +
 * active scope for the demo project. Shape matches contracts rows. */
export interface AssessmentTargetOption {
  target: {
    id: string;
    label: string;
    canonicalOrigin: string;
    targetKind: string;
    state: string;
  };
  environment: { id: string; label: string; currentRevision: string };
  scope: {
    id: string;
    allowedTestPackIds: string[];
    allowedMethods: string[];
    allowedPaths: string[];
    expiresAt: string;
    maxRequests: number;
    maxDurationSeconds: number;
  } | null;
}

export interface AssessmentContext {
  project: { id: string; name: string; slug: string };
  targets: AssessmentTargetOption[];
}

const AssessmentTargetSchema = {
  parse(v: unknown): AssessmentContext | null {
    if (typeof v !== "object" || v === null) return null;
    const o = v as Record<string, unknown>;
    if (typeof o.project !== "object" || o.project === null) return null;
    if (!Array.isArray(o.targets)) return null;
    return o as unknown as AssessmentContext;
  },
};

export function getAssessmentContext(
  projectId: string,
): Promise<ApiResult<AssessmentContext>> {
  return request(
    `/api/v1/projects/${projectId}/assessment-context`,
    { method: "GET" },
    (v) => AssessmentTargetSchema.parse(v),
  );
}

export function scanEventsUrl(scanId: string): string {
  return `/api/v1/scans/${scanId}/stream`;
}
