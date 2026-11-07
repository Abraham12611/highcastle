"use client";

import { useState } from "react";
import Link from "next/link";
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
import { DEMO_SCANS_ENDPOINT, DEMO_WORKSPACE_SLUG, demoScanRequest } from "./constants";

/**
 * Demo consent + start. Records explicit acknowledgement, then attempts
 * the genuine scan creation POST. If the workspace API isn't reachable
 * yet (L18 pending) the UI says so plainly and offers the recorded
 * preview below — no fake progress, no fabricated scan id.
 */

type Handoff =
  | { state: "idle" }
  | { state: "submitting" }
  | { state: "started"; scanId: string; eventsUrl: string }
  | { state: "pending"; reason: string };

export function DemoConsent() {
  const [acknowledged, setAcknowledged] = useState(false);
  const [handoff, setHandoff] = useState<Handoff>({ state: "idle" });

  async function start() {
    setHandoff({ state: "submitting" });
    try {
      const res = await fetch(DEMO_SCANS_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(demoScanRequest(`demo-${crypto.randomUUID()}`)),
      });
      if (!res.ok) {
        setHandoff({
          state: "pending",
          reason: `API answered ${res.status} — the demo workspace handoff is still integrating.`,
        });
        return;
      }
      const body = (await res.json()) as { scanId?: string; eventsUrl?: string };
      if (body.scanId && body.eventsUrl) {
        setHandoff({ state: "started", scanId: body.scanId, eventsUrl: body.eventsUrl });
        return;
      }
      setHandoff({ state: "pending", reason: "Unexpected response shape from the scans API." });
    } catch {
      setHandoff({
        state: "pending",
        reason: "No response — the public demo API is not deployed on this host yet.",
      });
    }
  }

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
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAcknowledged(e.target.checked)}
          label="I understand this runs an authorized, bounded test on HighCastle's own lab."
        />

        {handoff.state === "started" ? (
          <div className="hc-callout hc-callout--success">
            <Icon name="check-circle" size={16} />
            <div>
              <p className="hc-callout-title">Scan accepted — handoff to the live workspace</p>
              <p className="hc-callout-body">
                scan <span className="hc-mono">{handoff.scanId}</span> — live events at{" "}
                <span className="hc-mono">{handoff.eventsUrl}</span>
              </p>
              <div className="mt-3">
                <Link
                  href={`/app/scans/${handoff.scanId}`}
                  className="hc-btn hc-btn--primary hc-btn--sm"
                >
                  Open live investigation
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <Button
              onClick={start}
              disabled={!acknowledged}
              loading={handoff.state === "submitting"}
              icon="beacon"
            >
              Start controlled demo scan
            </Button>
            {handoff.state === "pending" ? (
              <StatusPill tone="amber" icon="clock" label="Handoff pending" />
            ) : null}
          </div>
        )}

        {handoff.state === "pending" ? (
          <Callout tone="warning" title="Workspace handoff still integrating">
            {handoff.reason} The consent flow above issues the real create-scan request — when the
            app shell/API lanes land, this button opens the live investigation directly. Until then,
            the recorded preview below shows exactly what it produces.
          </Callout>
        ) : null}
      </PanelBody>
    </Panel>
  );
}
