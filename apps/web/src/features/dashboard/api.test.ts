import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  DashboardApiError,
  WorkspaceSummarySchema,
  getCurrentScope,
  getProject,
  getProjectFindings,
  getProjectScans,
  getProjects,
  getWorkspaces,
  summarizeFindings,
  summarizeScans,
} from "./api";
import { STORY_FINDINGS, STORY_PROJECT, STORY_SCANS, STORY_WORKSPACE } from "./fixtures";

function stubFetch(handler: (url: string) => { status: number; body: unknown }) {
  return vi.fn(async (input: string) => {
    const { status, body } = handler(input);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  });
}

const OPTIONS = { baseUrl: "https://app.test", cookieHeader: "session=abc" };

describe("adapter envelope handling", () => {
  it("parses workspace lists and forwards the session cookie", async () => {
    const fetchFn = stubFetch((url) => {
      expect(url).toBe("https://app.test/api/v1/workspaces");
      return { status: 200, body: { data: [STORY_WORKSPACE] } };
    });
    const workspaces = await getWorkspaces(fetchFn, OPTIONS);
    expect(workspaces).toEqual([STORY_WORKSPACE]);
    expect(fetchFn).toHaveBeenCalledWith(
      "https://app.test/api/v1/workspaces",
      expect.objectContaining({ headers: { cookie: "session=abc" } }),
    );
  });

  it("parses project scans and findings arrays", async () => {
    const fetchFn = stubFetch(() => ({ status: 200, body: { data: STORY_SCANS } }));
    expect(await getProjectScans(fetchFn, OPTIONS, "pid")).toHaveLength(2);
    const fetchFindings = stubFetch(() => ({ status: 200, body: { data: STORY_FINDINGS } }));
    expect(await getProjectFindings(fetchFindings, OPTIONS, "pid")).toHaveLength(1);
  });

  it("parses single projects", async () => {
    const fetchFn = stubFetch((url) => {
      expect(url).toBe("https://app.test/api/v1/projects/p1");
      return { status: 200, body: { data: STORY_PROJECT } };
    });
    expect(await getProject(fetchFn, OPTIONS, "p1")).toMatchObject({ id: STORY_PROJECT.id });
    const fetchProjects = stubFetch(() => ({ status: 200, body: { data: [STORY_PROJECT] } }));
    expect(await getProjects(fetchProjects, OPTIONS, "w1")).toHaveLength(1);
  });

  it("maps 401/403 to unauthorized errors with the contract message", async () => {
    for (const status of [401, 403]) {
      const fetchFn = stubFetch(() => ({
        status,
        body: { error: { code: "forbidden", message: "No access." } },
      }));
      const error = await getWorkspaces(fetchFn, OPTIONS).catch((error: unknown) => error);
      expect(error).toBeInstanceOf(DashboardApiError);
      expect((error as DashboardApiError).status).toBe(status);
      expect((error as DashboardApiError).isUnauthorized).toBe(true);
      expect((error as DashboardApiError).message).toBe("No access.");
    }
  });

  it("maps 404/500 to failed errors with request ids", async () => {
    const fetchFn = stubFetch(() => ({
      status: 500,
      body: { error: { code: "internal", message: "Boom.", requestId: "req-1" } },
    }));
    const error = await getWorkspaces(fetchFn, OPTIONS).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(DashboardApiError);
    expect((error as DashboardApiError).requestId).toBe("req-1");
    expect((error as DashboardApiError).isUnauthorized).toBe(false);
  });

  it("fails closed on network errors and malformed payloads", async () => {
    const down = vi.fn(async () => {
      throw new Error("down");
    });
    await expect(getWorkspaces(down, OPTIONS)).rejects.toMatchObject({ status: 0 });
    const malformed = stubFetch(() => ({ status: 200, body: { data: [{ nope: true }] } }));
    await expect(getWorkspaces(malformed, OPTIONS)).rejects.toMatchObject({ status: 502 });
    const noEnvelope = stubFetch(() => ({ status: 200, body: null }));
    await expect(getWorkspaces(noEnvelope, OPTIONS)).rejects.toMatchObject({ status: 502 });
  });

  it("returns null for a missing current scope, throws for other failures", async () => {
    const missing = stubFetch(() => ({
      status: 404,
      body: { error: { code: "not_found", message: "None." } },
    }));
    await expect(getCurrentScope(missing, OPTIONS, "p")).resolves.toBeNull();
    const broken = stubFetch(() => ({
      status: 500,
      body: { error: { code: "internal", message: "Boom." } },
    }));
    await expect(getCurrentScope(broken, OPTIONS, "p")).rejects.toMatchObject({ status: 500 });
  });

  it("never fabricates: schema rejects invented scan shapes", async () => {
    const invented = stubFetch(() => ({
      status: 200,
      body: { data: [{ id: "x", riskScore: 9.9, verdict: "pwned" }] },
    }));
    await expect(getProjectScans(invented, OPTIONS, "p")).rejects.toMatchObject({ status: 502 });
  });
});

describe("honest summaries", () => {
  it("counts scans by lifecycle from real rows", () => {
    expect(summarizeScans(STORY_SCANS)).toEqual({ total: 2, active: 1, completed: 1, failed: 0 });
    expect(summarizeScans([])).toEqual({ total: 0, active: 0, completed: 0, failed: 0 });
  });

  it("counts findings by evidence axis and remediation position", () => {
    expect(summarizeFindings(STORY_FINDINGS)).toEqual({
      total: 1,
      confirmedByExecution: 1,
      open: 1,
      verifiedFixed: 0,
    });
  });

  it("workspace summaries ignore unknown BFF fields but require identity", () => {
    expect(WorkspaceSummarySchema.safeParse({ ...STORY_WORKSPACE, future: 1 }).success).toBe(true);
    expect(WorkspaceSummarySchema.safeParse({ slug: "x" }).success).toBe(false);
  });

  it("adapter schema rejects non-UUID ids", () => {
    expect(z.string().uuid().safeParse("not-a-uuid").success).toBe(false);
  });
});
