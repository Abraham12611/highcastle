"use client";

import { useState } from "react";
import {
  Button,
  Callout,
  Checkbox,
  Icon,
  Panel,
  PanelBody,
  ScopePanel,
  StatusPill,
} from "@highcastle/ui";
import {
  DEMO_SESSION_ENDPOINT,
  DEMO_WORKSPACE_SLUG,
  assessmentContextEndpoint,
  createScanEndpoint,
  demoScanBody,
  type AssessmentContext,
  selectApprovedTarget,
  type CreatedScan,
  type DemoSession,
} from "./constants";

/**
 * Complete demo handoff (L07):
 *   sign demo session → read authorized context → typed create-scan
 *   POST with Idempotency-Key header → navigate /app/scans/:scanId.
 * Every failure surfaces the API's real error — never invented success.
 */

type Step = "session" | "context" | "scan";
type Phase =
  | { state: "idle" }
  | { state: "working"; step: Step }
  | { state: "started"; scan: CreatedScan }
  | { state: "failed"; step: Step; code: string; message: string };

interface ApiEnvelope<T> {
  data?: T;
  error?: { code?: string; message?: string };
  requestId?: string;
}

async function apiJson<T>(input: string, init: RequestInit): Promise<T> {
  const res = await fetch(input, { ...init, credentials: "same-origin" });
  const body = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!res.ok) {
    const err = body?.error;
    throw new ApiError(
      err?.code ?? `http_${res.status}`,
      err?.message ?? `Request failed (${res.status})`,
      body?.requestId,
    );
  }
  return (body?.data ?? body) as T;
}

class ApiError extends Error {
  code: string;
  requestId?: string | undefined;
  constructor(code: string, message: string, requestId?: string) {
    super(message);
    this.code = code;
    this.requestId = requestId;
  }
}

export function DemoConsent() {
  const [acknowledged, setAcknowledged] = useState(false);
  const [phase, setPhase] = useState<Phase>({ state: "idle" });

  async function start() {
    let step: Step = "session";
    try {
      // 1 — server-verified signed demo session (cookie set by response)
      setPhase({ state: "working", step: "session" });
      const minted = await apiJson<{ session: DemoSession }>(DEMO_SESSION_ENDPOINT, {
        method: "POST",
        headers: { "x-highcastle-request": "1" },
      });
      // L05's auth endpoint returns { session: {...}, notice }, not {data: ...}.
      const session = minted.session;
      if (!session?.projectId) throw new ApiError("session_contract", "Demo session response missing projectId");

      // 2 — server-authorized environment/target/scope for that project
      step = "context";
      setPhase({ state: "working", step: "context" });
      const ctx = await apiJson<AssessmentContext>(
        assessmentContextEndpoint(session.projectId),
        { method: "GET" },
      );

      const approvedTarget = selectApprovedTarget(ctx);
      if (!approvedTarget) {
        throw new ApiError("scope_unavailable", "No authorized invoice-lab assessment scope is available");
      }

      // 3 — exact typed scan request, Idempotency-Key in header
      step = "scan";
      setPhase({ state: "working", step: "scan" });
      const created = await apiJson<CreatedScan>(
        createScanEndpoint(session.projectId),
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-highcastle-request": "1",
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify(demoScanBody(approvedTarget)),
        },
      );
      setPhase({ state: "started", scan: created });
    } catch (e) {
      setPhase({
        state: "failed",
        step,
        code: e instanceof ApiError ? e.code : "network",
        message: e instanceof Error ? e.message : "Request failed",
      });
    }
  }

  const working = phase.state === "working";

  return (
    <Panel>
      <PanelBody className="flex flex-col gap-5 p-6">
        <div className="flex items-center gap-3">
          <Icon name="lock" size={18} className="text-hc-primary" />
          <h2 className="text-lg font-bold text-hc-text">Consent &amp; scope check</h2>
        </div>

        <ScopePanel
          title="This demo will"
          entries={[
            { label: "Target", value: "target-lab (HighCastle-owned synthetic invoice app)" },
            { label: "Check", value: "bola-invoice-v1 — broken object authorization" },
            { label: "Identities", value: "alice, bob — synthetic tenants, seeded records" },
            { label: "Limits", value: "GET only · ≤8 requests · ≤30s · disposable sandbox" },
            { label: "Workspace", value: DEMO_WORKSPACE_SLUG },
          ]}
        />

        <Callout tone="info" title="What it will not do">
          No writes, no third-party systems, no real customer data, no persistent environment — the
          sandbox is destroyed and the cleanup is verified.
        </Callout>

        <Checkbox
          checked={acknowledged}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setAcknowledged(e.target.checked)
          }
          label="I understand this runs an authorized, bounded test on HighCastle's own lab."
        />

        {phase.state === "started" ? (
          <div className="hc-callout hc-callout--success">
            <Icon name="check-circle" size={16} />
            <div>
              <p className="hc-callout-title">Scan accepted</p>
              <p className="hc-callout-body">
                scan <span className="hc-mono">{phase.scan.scanId}</span>
              </p>
              <div className="mt-3">
                <a
                  href={`/app/scans/${phase.scan.scanId}`}
                  className="hc-btn hc-btn--primary hc-btn--sm"
                >
                  Open live investigation
                </a>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <Button
              onClick={start}
              disabled={!acknowledged}
              loading={working}
              icon="beacon"
            >
              {working
                ? phase.step === "session"
                  ? "Signing demo session"
                  : phase.step === "context"
                    ? "Reading authorized scope"
                    : "Submitting scan request"
                : "Start controlled demo scan"}
            </Button>
            {phase.state === "failed" ? (
              <StatusPill tone="coral" icon="x-circle" label={`${phase.step} failed`} />
            ) : null}
          </div>
        )}

        {phase.state === "failed" ? (
          <Callout tone="danger" title={`${phase.code}`}>
            {phase.message}
          </Callout>
        ) : null}
      </PanelBody>
    </Panel>
  );
}
