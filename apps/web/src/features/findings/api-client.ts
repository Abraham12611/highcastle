/**
 * Findings/replays BFF client (L10).
 *
 * Calls ONLY the contracted endpoints (architecture/05_API_CONTRACTS):
 * - GET    /api/v1/projects/:pid/findings
 * - GET    /api/v1/findings/:fid
 * - GET    /api/v1/findings/:fid/occurrences (reserved; not yet rendered)
 * - POST   /api/v1/findings/:fid/fix-prompt
 * - POST   /api/v1/findings/:fid/replays
 * - GET    /api/v1/replays/:rid
 *
 * Every response is validated with the contract schemas. Transport,
 * auth, and missing-route failures map to explicit `LoadState`s — the UI
 * renders each one instead of substituting content. `fetchImpl` is
 * injectable so tests observe the mapping without a network.
 */

import {
  ApiErrorSchema,
  FindingSchema,
  FixPromptResponseSchema,
  ReplayRequestSchema,
  ReplaySchema,
  type Finding,
  type FixPromptResponse,
  type Replay,
} from "@highcastle/contracts";
import type { LoadState } from "./types";

export type FetchImpl = typeof fetch;

/** Structural schema surface: validated by the contract schemas below. */
interface DataSchema<T> {
  safeParse(data: unknown): { success: true; data: T } | { success: false; error: unknown };
}

/** Contract envelopes are `{ data }`; validate the inner value only. */
function envelopeData(json: unknown): { present: true; data: unknown } | { present: false } {
  if (typeof json !== "object" || json === null) return { present: false };
  const data = (json as { data?: unknown }).data;
  return data === undefined ? { present: false } : { present: true, data };
}

function parseEnvelope<T>(json: unknown, schema: DataSchema<T>): T | null {
  const envelope = envelopeData(json);
  if (!envelope.present) return null;
  const parsed = schema.safeParse(envelope.data);
  return parsed.success ? parsed.data : null;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

/**
 * Map an HTTP failure to a load state. A failure counts as the named
 * auth/routing state ONLY when the response carries the contracted API
 * error envelope — a bare 404/500 page means the endpoint itself is not
 * implemented yet, which is `unavailable`, never a resource verdict.
 */
async function httpStatus(
  response: Response,
): Promise<
  | { status: "unauthorized" }
  | { status: "forbidden" }
  | { status: "not-found" }
  | { status: "unavailable"; detail: string }
> {
  const envelope = ApiErrorSchema.safeParse(await readJson(response));
  if (!envelope.success) {
    return {
      status: "unavailable",
      detail: `HTTP ${response.status} without API envelope (endpoint not implemented?)`,
    };
  }
  if (response.status === 401) return { status: "unauthorized" };
  if (response.status === 403) return { status: "forbidden" };
  if (response.status === 404) return { status: "not-found" };
  return { status: "unavailable", detail: `HTTP ${response.status}` };
}

function parseFindingList(data: unknown): Finding[] | null {
  if (!Array.isArray(data)) return null;
  const out: Finding[] = [];
  for (const item of data) {
    const parsed = FindingSchema.safeParse(item);
    if (!parsed.success) return null;
    out.push(parsed.data);
  }
  return out;
}

async function get<T>(
  fetchImpl: FetchImpl,
  url: string,
  parse: (data: unknown) => T | null,
): Promise<LoadState<T>> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
    });
  } catch (error) {
    return {
      status: "unavailable",
      detail: error instanceof Error ? error.message : "network failure",
    };
  }
  if (!response.ok) {
    return httpStatus(response);
  }
  const parsed = parseEnvelope(await readJson(response), {
    safeParse: (data: unknown) => {
      const value = parse(data);
      return value === null
        ? { success: false as const, error: "invalid" }
        : { success: true as const, data: value };
    },
  });
  if (parsed === null) {
    return { status: "unavailable", detail: "contract validation failed" };
  }
  return { status: "ok", data: parsed, source: { kind: "api" } };
}

function single<T>(schema: DataSchema<T>): (data: unknown) => T | null {
  return (data: unknown) => {
    const parsed = schema.safeParse(data);
    return parsed.success ? parsed.data : null;
  };
}

export function listFindings(
  baseUrl: string,
  projectId: string,
  fetchImpl: FetchImpl = fetch,
): Promise<LoadState<Finding[]>> {
  return get(
    fetchImpl,
    `${baseUrl}/api/v1/projects/${encodeURIComponent(projectId)}/findings`,
    parseFindingList,
  );
}

export function getFinding(
  baseUrl: string,
  findingId: string,
  fetchImpl: FetchImpl = fetch,
): Promise<LoadState<Finding>> {
  return get(
    fetchImpl,
    `${baseUrl}/api/v1/findings/${encodeURIComponent(findingId)}`,
    single(FindingSchema),
  );
}

export function getFixPrompt(
  baseUrl: string,
  findingId: string,
  fetchImpl: FetchImpl = fetch,
): Promise<LoadState<FixPromptResponse>> {
  const url = `${baseUrl}/api/v1/findings/${encodeURIComponent(findingId)}/fix-prompt`;
  return (async (): Promise<LoadState<FixPromptResponse>> => {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: { accept: "application/json" },
      });
    } catch (error) {
      return {
        status: "unavailable",
        detail: error instanceof Error ? error.message : "network failure",
      };
    }
    if (!response.ok) {
      return httpStatus(response);
    }
    const parsed = parseEnvelope(await readJson(response), FixPromptResponseSchema);
    if (parsed === null) {
      return { status: "unavailable", detail: "contract validation failed" };
    }
    return { status: "ok", data: parsed, source: { kind: "api" } };
  })();
}

export function getReplay(
  baseUrl: string,
  replayId: string,
  fetchImpl: FetchImpl = fetch,
): Promise<LoadState<Replay>> {
  return get(
    fetchImpl,
    `${baseUrl}/api/v1/replays/${encodeURIComponent(replayId)}`,
    single(ReplaySchema),
  );
}

export type ReplayRequestResult =
  | { status: "accepted"; replayId: string }
  | { status: "unauthorized" }
  | { status: "forbidden" }
  | { status: "not-found" }
  | { status: "unavailable"; detail: string };

/**
 * Initiate a replay. The request is validated client-side against the
 * contract `ReplayRequest` (which structurally excludes any verdict
 * field); the VERDICT always comes back from the server later via
 * `getReplay` — this function can never produce one.
 */
export async function requestReplay(
  baseUrl: string,
  findingId: string,
  request: unknown,
  idempotencyKey: string,
  fetchImpl: FetchImpl = fetch,
): Promise<ReplayRequestResult> {
  // Validated at the boundary: unknown keys (including any client-supplied
  // verdict) are rejected by the strict contract schema before any request.
  const body = ReplayRequestSchema.parse(request);
  let response: Response;
  try {
    response = await fetchImpl(
      `${baseUrl}/api/v1/findings/${encodeURIComponent(findingId)}/replays`,
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(body),
      },
    );
  } catch (error) {
    return {
      status: "unavailable",
      detail: error instanceof Error ? error.message : "network failure",
    };
  }
  if (!response.ok) {
    return httpStatus(response);
  }
  const parsed = parseEnvelope(await readJson(response), ReplaySchema);
  if (parsed === null) {
    return { status: "unavailable", detail: "contract validation failed" };
  }
  return { status: "accepted", replayId: parsed.id };
}
