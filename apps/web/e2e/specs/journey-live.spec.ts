import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { LIVE } from "./live-env";

/**
 * FULL PIPELINE acceptance against the deployed containerized backend.
 *
 * Gated: runs only with `HC_E2E_LIVE=1` + `HC_E2E_BASE_URL=https://<staging>`.
 * Every assertion below names persisted, server-issued values — scan ids,
 * monotonic event seqs/ids, oracle verdicts, evidence hashes, replay
 * verdicts — and cross-checks the UI against them. Headings alone prove
 * nothing and are never the assertion.
 *
 * The journey is one serial story sharing one scan: create → stream →
 * finding → fix → replay → verified_fixed, plus a separate cancellation.
 */
test.describe("full pipeline (deployed containerized backend)", () => {
  test.skip(!LIVE, "requires HC_E2E_LIVE=1 + HC_E2E_BASE_URL against the deployed pipeline");
  test.describe.configure({ mode: "serial" });

  /** Server-issued artifacts shared across the serial tests. */
  const shared: {
    projectId?: string;
    scanId?: string;
    findingId?: string;
    attemptId?: string;
    scopeHash?: string;
  } = {};

  async function api(
    request: APIRequestContext,
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<{ status: number; json: unknown }> {
    const res = await request[method === "POST" ? "post" : "get"](path, {
      headers: {
        "x-highcastle-request": "1",
        ...(body ? { "content-type": "application/json" } : {}),
        ...headers,
      },
      ...(body ? { data: body } : {}),
    });
    return { status: res.status(), json: await res.json().catch(() => null) };
  }

  const dataOf = (json: unknown) =>
    (json as { data?: unknown } | null)?.data as Record<string, unknown>;

  async function pollFor<T>(
    label: string,
    fn: () => Promise<T | null>,
    timeoutMs: number,
  ): Promise<T> {
    const start = Date.now();
    for (;;) {
      const value = await fn().catch(() => null);
      if (value !== null) return value;
      if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${label}`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  async function mintSession(request: APIRequestContext): Promise<{ projectId: string }> {
    const { status, json } = await api(request, "POST", "/api/auth/demo");
    expect(status, "demo session mint").toBe(201);
    const session = (json as { session?: { projectId?: string } }).session;
    expect(session?.projectId, "session carries the authorized project id").toMatch(
      /^[0-9a-f-]{36}$/,
    );
    return { projectId: session!.projectId! };
  }

  interface CtxTarget {
    target: { id: string; label: string };
    environment: { id: string; label: string; currentRevision: string };
    scope: { id: string; allowedTestPackIds: string[] } | null;
  }

  async function assessment(request: APIRequestContext, projectId: string) {
    const { status, json } = await api(
      request,
      "GET",
      `/api/v1/projects/${projectId}/assessment-context`,
    );
    expect(status, "assessment context").toBe(200);
    const data = dataOf(json) as { project: { id: string }; targets: CtxTarget[] };
    expect(data.project.id, "context is for the session project").toBe(projectId);
    const approved = data.targets.find((t) => t.scope !== null);
    expect(approved, "an approved target+scope exists").toBeDefined();
    return approved!;
  }

  test("creates a real scan and streams persisted events with stable ids", async ({ page }) => {
    test.setTimeout(600_000);
    const { request } = page;
    const { projectId } = await mintSession(request);
    shared.projectId = projectId;
    const ctx = await assessment(request, projectId);
    expect(ctx.scope!.allowedTestPackIds).toContain("bola-invoice-v1");

    const created = await api(
      request,
      "POST",
      `/api/v1/projects/${projectId}/scans`,
      {
        type: "targeted_red_team",
        environmentId: ctx.environment.id,
        targetId: ctx.target.id,
        authorizationScopeId: ctx.scope!.id,
        testPackIds: ["bola-invoice-v1"],
      },
      { "Idempotency-Key": crypto.randomUUID() },
    );
    expect(created.status, "scan accepted").toBe(202);
    const scan = dataOf(created.json) as {
      scanId: string;
      status: string;
      scopeHash: string;
      targetRevision: string;
    };
    expect(scan.scanId, "server-issued scan id").toMatch(/^[0-9a-f-]{36}$/);
    expect(scan.status).toBe("queued");
    expect(scan.scopeHash, "64-hex scope hash").toMatch(/^[0-9a-f]{64}$/);
    expect(scan.targetRevision, "bounded to the vulnerable twin").toBe("lab-v1-vulnerable");
    shared.scanId = scan.scanId;
    shared.scopeHash = scan.scopeHash;

    // The worker executes for real: executed > 0 and the BOLA reproduces.
    const summary = await pollFor(
      "terminal scan summary",
      async () => {
        const { status, json } = await api(request, "GET", `/api/v1/scans/${scan.scanId}`);
        if (status !== 200) return null;
        const s = dataOf(json) as {
          scanId: string;
          terminal: boolean;
          status: string;
          executedCount: number;
          confirmedCount: number;
        };
        if (!s.terminal) return null;
        expect(s.scanId).toBe(scan.scanId);
        return s;
      },
      540_000,
    );
    expect(summary.executedCount, "worker executed checks").toBeGreaterThan(0);
    expect(summary.confirmedCount, "BOLA reproduced on the vulnerable twin").toBeGreaterThanOrEqual(
      1,
    );

    // Persisted events: contiguous seq from 1, stable ids, load-bearing refs.
    // The BFF returns `{ data: ScanEvent[] }` (bare array, not `{events}`).
    const { status, json } = await api(
      request,
      "GET",
      `/api/v1/scans/${scan.scanId}/events?after=0`,
    );
    expect(status).toBe(200);
    const data = dataOf(json);
    const raw = Array.isArray(data) ? data : (data as { events?: unknown }).events;
    expect(raw, "events payload is a list").toBeDefined();
    const events = raw as Array<{
      id: string;
      seq: number;
      scanId: string;
      eventType: string;
      attemptId: string | null;
      payloadRedacted?: Record<string, unknown>;
    }>;
    expect(events.length, "persisted event frames").toBeGreaterThan(0);
    expect(
      events.map((e) => e.seq),
      "seq starts at 1 and is contiguous",
    ).toEqual(events.map((_, i) => i + 1));
    for (const e of events) expect(e.scanId).toBe(scan.scanId);
    const executed = events.find((e) => e.eventType === "test.executed");
    expect(executed?.attemptId, "test.executed carries the attempt id").toMatch(/^[0-9a-f-]{36}$/);
    const confirmed = events.find((e) => e.eventType === "finding.confirmed");
    const findingId = confirmed?.payloadRedacted?.["findingId"];
    expect(findingId, "finding.confirmed carries the finding id").toMatch(/^[0-9a-f-]{36}$/);
    shared.findingId = findingId as string;
    shared.attemptId = executed!.attemptId as string;
    // Proof IDs in stdout: Playwright captures these per test, so any later
    // failure in the serial chain is self-identifying without re-running.
    console.log(
      `live proof scanId=${scan.scanId} attemptId=${shared.attemptId} findingId=${shared.findingId} scopeHash=${scan.scopeHash}`,
    );

    // Resume: re-reading returns the SAME ids (durable, not recomputed).
    const reread = await api(request, "GET", `/api/v1/scans/${scan.scanId}/events?after=0`);
    const rereadData = dataOf(reread.json);
    const events2 = (
      Array.isArray(rereadData) ? rereadData : (rereadData as { events?: unknown }).events
    ) as Array<{ id: string }>;
    expect(events2.map((e) => e.id)).toEqual(events.map((e) => e.id));
    const tail = await api(
      request,
      "GET",
      `/api/v1/scans/${scan.scanId}/events?after=${events.length}`,
    );
    const tailData = dataOf(tail.json);
    const tailEvents = (
      Array.isArray(tailData) ? tailData : (tailData as { events?: unknown }).events
    ) as unknown[];
    expect(tailEvents ?? []).toHaveLength(0);

    // UI shows the same scan from persisted state — progress, not headings.
    await page.goto(`/app/scans/${scan.scanId}`);
    await expect(page.getByRole("heading", { name: /live investigation/i })).toBeVisible();
    await expect(page.locator(".phase-rail__step.is-done").first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText(scan.scanId.slice(0, 8))).toBeVisible();
  });

  test("finding carries oracle evidence and fix guidance", async ({ page }) => {
    test.setTimeout(960_000);
    const { request } = page;
    await mintSession(request);
    const projectId = shared.projectId!;
    const findingId = shared.findingId!;
    const attemptId = shared.attemptId!;

    const list = await api(request, "GET", `/api/v1/projects/${projectId}/findings`);
    expect(list.status).toBe(200);
    const rows = ((dataOf(list.json) as { findings?: unknown }).findings ??
      dataOf(list.json)) as Array<{
      id: string;
      title: string;
      confidence: string;
      latestConfirmedAttemptId: string | null;
    }>;
    const rowsArr = Array.isArray(rows) ? rows : [rows];
    const row = rowsArr.find((r) => r.id === findingId);
    expect(row, "finding persisted for the project").toBeDefined();
    expect(row!.confidence, "confidence comes from executed evidence").toBe(
      "confirmed_by_execution",
    );
    // The finding dedupes by fingerprint across scans, so its latest linked
    // attempt is whichever confirmed most recently — assert linkage, then
    // pin THIS scan's attempt at the occurrence level below.
    expect(row!.latestConfirmedAttemptId, "finding links a confirming attempt").toMatch(
      /^[0-9a-f-]{36}$/,
    );

    // Occurrence rows land asynchronously after finding.confirmed — the list
    // itself can be momentarily empty, and observed lag exceeds two minutes
    // on the deployment. Poll boundedly for this scan's attempt rather than
    // assuming immediacy. (Latency note for L16; the row does arrive.)
    type Occurrence = { attemptId: string | null; oracleVerdict: string };
    const readOccurrences = async (): Promise<Occurrence[]> => {
      const response = await api(request, "GET", `/api/v1/findings/${findingId}/occurrences`);
      expect(response.status).toBe(200);
      // The BFF returns `{ data: Occurrence[] }` (bare array, not
      // `{occurrences}`) — same envelope quirk as the scan events feed.
      const body = dataOf(response.json);
      return (
        Array.isArray(body) ? body : ((body as { occurrences?: unknown }).occurrences ?? [])
      ) as Occurrence[];
    };
    let occurrences = await readOccurrences();
    let mine = occurrences.find((o) => o.attemptId === attemptId);
    const start = Date.now();
    while (!mine && Date.now() - start < 900_000) {
      await new Promise((r) => setTimeout(r, 5000));
      occurrences = await readOccurrences();
      mine = occurrences.find((o) => o.attemptId === attemptId);
    }
    expect(occurrences.length, "at least one occurrence").toBeGreaterThan(0);
    expect(mine, "this scan's attempt confirmed the finding").toBeDefined();
    expect(mine!.oracleVerdict, "oracle reproduced the defect").toBe("reproduced");

    const att = await api(request, "GET", `/api/v1/attempts/${attemptId}`);
    expect(att.status).toBe(200);
    const attempt = dataOf(att.json) as {
      verdict: string;
      evidence: Array<{ id: string; sha256: string; redacted: boolean }>;
    };
    expect(attempt.verdict, "independent oracle verdict").toBe("reproduced");
    expect(attempt.evidence.length, "recorded evidence artifacts").toBeGreaterThan(0);
    for (const ev of attempt.evidence) {
      expect(ev.sha256, "artifact content hash").toMatch(/^[0-9a-f]{64}$/);
      expect(ev.redacted, "artifacts stored redacted").toBe(true);
    }

    const fix = await api(request, "POST", `/api/v1/findings/${findingId}/fix-prompt`);
    expect(fix.status, "fix-prompt flow accepts POST").toBe(200);
    const guidance = JSON.stringify(dataOf(fix.json) ?? fix.json);
    expect(guidance.length, "fix guidance is substantive").toBeGreaterThan(100);

    // UI renders the same persisted values on every tab.
    // The detail loader serves the finding's LINKED attempt (row linkage),
    // which can lag the freshest confirmation (known staleness, filed to
    // E18/E19) — so the proof-tab assertion pins the linked attempt's own
    // evidence digest, fetched from the API, never invented.
    const linked = await api(request, "GET", `/api/v1/attempts/${row!.latestConfirmedAttemptId}`);
    expect(linked.status, "linked attempt persisted").toBe(200);
    const linkedSha = (dataOf(linked.json) as { evidence: Array<{ sha256: string }> })
      .evidence[0]!.sha256;
    expect(linkedSha, "linked evidence hash").toMatch(/^[0-9a-f]{64}$/);
    const base = `/app/w/highcastle-demo/projects/${projectId}/findings/${findingId}`;
    await page.goto(`${base}/overview`);
    // The header renders the API title (raw UUIDs are never shown in the
    // UI); the fingerprint paragraph above it is the stable identifier.
    await expect(page.getByRole("heading", { name: row!.title }).first()).toBeVisible({
      timeout: 60_000,
    });
    await page.goto(`${base}/proof`);
    await expect(page.getByText(/reproduced/i).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(linkedSha.slice(0, 12)).first()).toBeVisible({
      timeout: 60_000,
    });
    await page.goto(`${base}/fix`);
    await expect(page.getByText(/remediation|fix/i).first()).toBeVisible({ timeout: 60_000 });
  });

  test("patched replay reaches verified_fixed", async ({ page }) => {
    test.setTimeout(600_000);
    const { request } = page;
    await mintSession(request);
    const projectId = shared.projectId!;
    const findingId = shared.findingId!;
    const attemptId = shared.attemptId!;

    const ctx = await assessment(request, projectId);
    const patched = (
      dataOf(
        (await api(request, "GET", `/api/v1/projects/${projectId}/assessment-context`)).json,
      ) as { targets: CtxTarget[] }
    ).targets.find((t) => t.environment.currentRevision === "lab-v2-patched");
    expect(patched, "patched twin is an authorized environment").toBeDefined();

    const created = await api(request, "POST", `/api/v1/findings/${findingId}/replays`, {
      originalAttemptId: attemptId,
      patchedEnvironmentId: patched!.environment.id,
      patchedRevision: "lab-v2-patched",
      authorizationScopeId: ctx.scope!.id,
    });
    expect(created.status, "replay accepted").toBe(202);
    const replayId =
      (dataOf(created.json) as { id?: string; replayId?: string }).id ??
      (dataOf(created.json) as { replayId?: string }).replayId;
    expect(replayId, "server-issued replay id").toMatch(/^[0-9a-f-]{36}$/);

    const replay = await pollFor(
      "completed replay",
      async () => {
        const { status, json } = await api(request, "GET", `/api/v1/replays/${replayId}`);
        if (status !== 200) return null;
        const r = dataOf(json) as {
          verdict: string | null;
          positiveAssertionPassed: boolean | null;
          negativeAssertionPassed: boolean | null;
          patchedRevision: string;
        };
        if (r.verdict === null) return null;
        return r;
      },
      540_000,
    );
    expect(replay.patchedRevision, "replay ran on the patched twin").toBe("lab-v2-patched");
    expect(replay.positiveAssertionPassed, "own-invoice read still passes").toBe(true);
    expect(replay.negativeAssertionPassed, "cross-account read now denied").toBe(true);
    expect(replay.verdict, "deterministic oracle verdict").toBe("verified_fixed");

    const refetch = await api(request, "GET", `/api/v1/projects/${projectId}/findings`);
    const rows = ((dataOf(refetch.json) as { findings?: unknown }).findings ??
      dataOf(refetch.json)) as Array<{ id: string; remediationStatus: string }>;
    const rowsArr = Array.isArray(rows) ? rows : [rows];
    expect(rowsArr.find((r) => r.id === findingId)?.remediationStatus).toBe("verified_fixed");

    await page.goto(`/app/w/highcastle-demo/projects/${projectId}/findings/${findingId}/replay`);
    await expect(page.getByText(/verified_fixed/i).first()).toBeVisible({ timeout: 60_000 });
  });

  test("cancellation is terminal and honored", async ({ page }: { page: Page }) => {
    test.setTimeout(300_000);
    const { request } = page;
    const { projectId } = await mintSession(request);
    const ctx = await assessment(request, projectId);

    const created = await api(
      request,
      "POST",
      `/api/v1/projects/${projectId}/scans`,
      {
        type: "targeted_red_team",
        environmentId: ctx.environment.id,
        targetId: ctx.target.id,
        authorizationScopeId: ctx.scope!.id,
        testPackIds: ["bola-invoice-v1"],
      },
      { "Idempotency-Key": crypto.randomUUID() },
    );
    expect(created.status).toBe(202);
    const scanId = (dataOf(created.json) as { scanId: string }).scanId;

    const canceled = await api(request, "POST", `/api/v1/scans/${scanId}/cancel`, {});
    expect(canceled.status, "cancel accepted").toBe(202);

    const summary = await pollFor(
      "canceled scan summary",
      async () => {
        const { status, json } = await api(request, "GET", `/api/v1/scans/${scanId}`);
        if (status !== 200) return null;
        const s = dataOf(json) as {
          terminal: boolean;
          status: string;
          cancelRequestedAt: string | null;
        };
        if (!s.terminal) return null;
        return s;
      },
      120_000,
    );
    expect(summary.status, "terminal cancellation state").toBe("canceled");
    expect(summary.cancelRequestedAt, "cancellation recorded on the scan").not.toBeNull();

    await page.goto(`/app/scans/${scanId}`);
    await expect(page.getByRole("heading", { name: /live investigation/i })).toBeVisible();
    await expect(page.getByText(/cancel/i).first()).toBeVisible({ timeout: 60_000 });
  });
});
