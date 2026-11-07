import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "@highcastle/db";
import { DEMO_IDS, createWorkspace, getTarget } from "@highcastle/db";
import type { DnsResolver, FetchRequest, HttpResponse, SocketFactory } from "@highcastle/security";
import { createTestDb } from "@/server/db";
import type { BffDeps } from "@/server/deps";
import { unavailableQueue } from "@/server/queue";
import type { HighCastleSession } from "@/lib/auth/session-core";
import { demoSession } from "@/server/test-helpers";
import {
  createBuilderProjectFlow,
  getBuilderTargetFlow,
  grantSitePermissionFlow,
  runPassiveReconFlow,
  verifyBuilderTargetFlow,
} from "@/server/builder";

let db: Database;
let close: () => Promise<void>;
let workspaceId: string;

const ACCOUNT: HighCastleSession = {
  kind: "account",
  userId: DEMO_IDS.ownerUserId,
  sessionId: "s_test",
  expiresAt: Date.now() + 3600_000,
};

function fakeResolver(
  map: Record<string, string[]>,
  txt: Record<string, string[][]> = {},
): DnsResolver {
  return {
    resolveAddresses: async (h) =>
      map[h] ??
      (() => {
        throw new Error("ENOTFOUND");
      })(),
    resolveTxt: async (h) =>
      txt[h] ??
      (() => {
        throw new Error("ENODATA");
      })(),
  };
}

const OK_TLS = {
  protocol: "TLSv1.3",
  cipherName: "x",
  alpnProtocol: "http/1.1",
  certSubject: "site.test",
  certIssuer: "CA",
  certNotBefore: "2025",
  certNotAfter: "2030",
  authorized: true,
};

function fakeFetcher(pages: HttpResponse[]): SocketFactory {
  let i = 0;
  return {
    httpsGet: async (_req: FetchRequest) => pages[i++] ?? pages[pages.length - 1]!,
  };
}

function page(status = 200, headers: Record<string, string[]> = {}, body = ""): HttpResponse {
  return {
    status,
    headers,
    body: new TextEncoder().encode(body),
    remoteIp: "93.184.216.34",
    redirectLocation: headers["location"]?.[0] ?? null,
    tls: OK_TLS,
  };
}

function deps(extra?: Partial<BffDeps>): BffDeps {
  return {
    db,
    queue: unavailableQueue(),
    session: ACCOUNT,
    now: new Date("2026-01-15T12:00:00Z"),
    ...extra,
  };
}

async function setupWorkspace() {
  const ws = await createWorkspace(db, {
    slug: "acct-ws",
    name: "Account WS",
    ownerUserId: ACCOUNT.userId,
  });
  workspaceId = ws.id;
}

beforeEach(async () => {
  const created = await createTestDb();
  db = created.db;
  close = created.close;
  await setupWorkspace();
  return () => close();
});

const CHALLENGE_TXT = "_highcastle-verification.site.test";

async function createDraft(d: BffDeps) {
  const res = await createBuilderProjectFlow(d, workspaceId, {
    name: "My site",
    siteUrl: "https://site.test",
  });
  expect(res.status).toBe(201);
  const data = res.body as {
    data: { targetId: string; verification: { dnsTxtValue: string; dnsRecordName: string } };
  };
  return data.data;
}

describe("createBuilderProjectFlow", () => {
  it("creates draft project + pending target + issued challenge", async () => {
    const created = await createDraft(deps());
    const target = await getTarget(db, workspaceId, created.targetId);
    expect(target?.state).toBe("pending_verification");
    expect(target?.canonicalOrigin).toBe("https://site.test");
    expect(created.verification.dnsRecordName).toBe(CHALLENGE_TXT);
    expect(created.verification.dnsTxtValue.startsWith("hc-verify=")).toBe(true);
  });

  it("coerces http:// input to https canonical origin", async () => {
    const res = await createBuilderProjectFlow(deps(), workspaceId, {
      name: "n",
      siteUrl: "http://site.test/",
    });
    const data = res.body as { data: { targetId: string } };
    const t = await getTarget(db, workspaceId, data.data.targetId);
    expect(t?.canonicalOrigin).toBe("https://site.test");
  });

  it("rejects SSRF spellings at intake — never stored", async () => {
    for (const siteUrl of [
      "https://127.0.0.1",
      "https://user:pw@site.test",
      "https://site.test:8443",
      "https://localhost",
      "https://2130706433/",
      "javascript:alert(1)",
    ]) {
      await expect(
        createBuilderProjectFlow(deps(), workspaceId, { name: "n", siteUrl }),
      ).rejects.toMatchObject({ code: "validation_error" });
    }
  });

  it("denies the demo session (lab-pinned), never leaks lab secrets", async () => {
    await expect(
      createBuilderProjectFlow({ ...deps(), session: demoSession() }, DEMO_IDS.workspaceId, {
        name: "x",
        siteUrl: "https://evil.test",
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("verifyBuilderTargetFlow", () => {
  it("verifies via dns-txt and marks the target verified", async () => {
    const d = deps({
      recon: {
        resolver: fakeResolver({}, { [CHALLENGE_TXT]: [["hc-verify="]] }),
        fetcher: fakeFetcher([]),
      },
    });
    const { targetId } = await createDraft(d);
    // read the issued token so the fake DNS answer matches it
    const statusRes = await getBuilderTargetFlow(d, workspaceId, targetId);
    const token = (statusRes.body as { data: { verification: { dnsTxtValue: string } } }).data
      .verification.dnsTxtValue;
    d.recon!.resolver = fakeResolver({}, { [CHALLENGE_TXT]: [[token]] });

    const res = await verifyBuilderTargetFlow(d, workspaceId, targetId, "dns-txt");
    expect((res.body as { data: { status: string } }).data.status).toBe("verified");
    const t = await getTarget(db, workspaceId, targetId);
    expect(t?.state).toBe("verified");
    expect(t?.verificationMethod).toBe("dns_challenge");
  });

  it("failed token keeps state verification_failed with user-safe reason", async () => {
    const d = deps({
      recon: {
        resolver: fakeResolver({}, { [CHALLENGE_TXT]: [["hc-verify=NOPE"]] }),
        fetcher: fakeFetcher([]),
      },
    });
    const { targetId } = await createDraft(d);
    const res = await verifyBuilderTargetFlow(d, workspaceId, targetId, "dns-txt");
    const data = (res.body as { data: { status: string; reason: string | null } }).data;
    expect(data.status).toBe("failed");
    expect(data.reason).toBeTruthy();
  });

  it("well-known method flows through the same pinned fetcher", async () => {
    const d = deps({
      recon: {
        resolver: fakeResolver({ "site.test": ["93.184.216.34"] }),
        fetcher: fakeFetcher([page(200, {}, "")]),
      },
    });
    const { targetId } = await createDraft(d);
    const s = await getBuilderTargetFlow(d, workspaceId, targetId);
    const expected = (s.body as { data: { verification: { wellKnownExpectedBody: string } } }).data
      .verification.wellKnownExpectedBody;
    d.recon!.fetcher = fakeFetcher([page(200, {}, `${expected}\n`)]);
    const res = await verifyBuilderTargetFlow(d, workspaceId, targetId, "well-known");
    expect((res.body as { data: { status: string } }).data.status).toBe("verified");
  });
});

describe("grantSitePermissionFlow + runPassiveReconFlow", () => {
  it("rejects permission before verification — no consent laundering", async () => {
    const d = deps();
    const { targetId } = await createDraft(d);
    await expect(
      grantSitePermissionFlow(d, workspaceId, targetId, { allowedPaths: ["/login"] }),
    ).rejects.toMatchObject({ code: "policy_denied" });
  });

  it("rejects recon without an active permission", async () => {
    const d = deps({ recon: { resolver: fakeResolver({}), fetcher: fakeFetcher([]) } });
    const { targetId } = await createDraft(d);
    const s = await getBuilderTargetFlow(d, workspaceId, targetId);
    const token = (s.body as { data: { verification: { dnsTxtValue: string } } }).data.verification
      .dnsTxtValue;
    d.recon!.resolver = fakeResolver({}, { [CHALLENGE_TXT]: [[token]] });
    await verifyBuilderTargetFlow(d, workspaceId, targetId, "dns-txt");
    await expect(runPassiveReconFlow(d, workspaceId, targetId)).rejects.toMatchObject({
      code: "policy_denied",
    });
  });

  it("runs recon end-to-end: fetches only permitted paths, stores observations", async () => {
    const pages = [
      page(200, {
        "strict-transport-security": ["max-age=63072000"],
        "set-cookie": ["sess=1; Secure; HttpOnly; SameSite=Lax"],
      }),
      page(200, {}),
      page(404, {}),
    ];
    const d = deps({
      recon: {
        resolver: fakeResolver({ "site.test": ["93.184.216.34"] }),
        fetcher: fakeFetcher(pages),
      },
    });
    const { targetId } = await createDraft(d);
    const s = await getBuilderTargetFlow(d, workspaceId, targetId);
    const token = (s.body as { data: { verification: { dnsTxtValue: string } } }).data.verification
      .dnsTxtValue;
    d.recon!.resolver = fakeResolver(
      { "site.test": ["93.184.216.34"] },
      { [CHALLENGE_TXT]: [[token]] },
    );
    await verifyBuilderTargetFlow(d, workspaceId, targetId, "dns-txt");

    const perm = await grantSitePermissionFlow(d, workspaceId, targetId, {
      allowedPaths: ["/login", "/status"],
    });
    expect(perm.status).toBe(201);

    const run = await runPassiveReconFlow(d, workspaceId, targetId);
    const data = (
      run.body as {
        data: {
          status: string;
          requestCount: number;
          observations: { name: string; observed: boolean }[];
          limitations: string[];
        };
      }
    ).data;
    expect(data.status).toBe("completed");
    expect(data.requestCount).toBe(3); // / + /login + /status
    expect(
      data.observations.some((o) => o.name === "strict-transport-security" && o.observed),
    ).toBe(true);
    expect(data.limitations.length).toBeGreaterThan(0);
  });

  it("run quota: 6th run in a day is rate_limited", async () => {
    const d = deps({
      recon: {
        resolver: fakeResolver({ "site.test": ["93.184.216.34"] }),
        fetcher: fakeFetcher([page(200)]),
      },
    });
    const { targetId } = await createDraft(d);
    const s = await getBuilderTargetFlow(d, workspaceId, targetId);
    const token = (s.body as { data: { verification: { dnsTxtValue: string } } }).data.verification
      .dnsTxtValue;
    d.recon!.resolver = fakeResolver(
      { "site.test": ["93.184.216.34"] },
      { [CHALLENGE_TXT]: [[token]] },
    );
    await verifyBuilderTargetFlow(d, workspaceId, targetId, "dns-txt");
    await grantSitePermissionFlow(d, workspaceId, targetId, { allowedPaths: ["/"] });

    for (let i = 0; i < 5; i++) await runPassiveReconFlow(d, workspaceId, targetId);
    await expect(runPassiveReconFlow(d, workspaceId, targetId)).rejects.toMatchObject({
      code: "rate_limited",
    });
  });
});
