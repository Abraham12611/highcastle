/**
 * Renders a static component gallery: every @highcastle/ui component
 * server-rendered with clearly labelled SAMPLE fixtures into
 * examples/gallery.html + copies of the runtime styles.
 *
 *   pnpm --filter @highcastle/ui example
 *
 * Open examples/gallery.html directly — the design system ships plain
 * CSS, so no build step is required to view it.
 */

import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement as h, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ActorBadge,
  AssertionChip,
  AttemptStatusBadge,
  BlockedState,
  Button,
  Callout,
  Checkbox,
  CodeBlock,
  ConfidenceBadge,
  ContainmentDiagram,
  ContainmentLedger,
  CopyButton,
  EmptyState,
  ErrorState,
  EvidenceCard,
  Field,
  FortressLogo,
  FortressMark,
  IconButton,
  InconclusiveState,
  LoadingState,
  NavRail,
  Panel,
  PanelBody,
  PanelHeader,
  PerimeterArt,
  PhaseBadge,
  ProofChainDiagram,
  RemediationBadge,
  ReplayDiff,
  ScanStatusBadge,
  ScopePanel,
  Select,
  SeverityBadge,
  SeverityMeter,
  SnapshotPill,
  StatusHeader,
  StatusPill,
  Stepper,
  Tabs,
  TextArea,
  TextInput,
  Timeline,
  TimelineLiveIndicator,
  TopBar,
  VerdictBadge,
} from "../src/index.js";
import type { ReactElement } from "react";

const stylesDir = fileURLToPath(new URL("../src/styles/", import.meta.url));
const outDir = fileURLToPath(new URL("../examples/", import.meta.url));

function Section({
  title,
  note,
  children,
  wide,
}: {
  title: string;
  note?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return h(
    "section",
    { style: { marginBottom: 56, gridColumn: wide ? "1 / -1" : undefined } },
    h(
      "h2",
      {
        style: {
          fontFamily: "var(--hc-font-display)",
          fontSize: 13,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--hc-cyan)",
          borderBottom: "1px solid var(--hc-line)",
          paddingBottom: 8,
          margin: "0 0 8px",
        },
      },
      title,
    ),
    note
      ? h("p", { style: { color: "var(--hc-subtle)", fontSize: 12, margin: "0 0 16px" } }, note)
      : null,
    h("div", { style: { display: "flex", flexDirection: "column", gap: 16 } }, children),
  );
}

function Row({ children }: { children: ReactNode }) {
  return h(
    "div",
    { style: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" } },
    children,
  );
}

const SAMPLE = "Sample fixture — not real evidence";

const page = h(
  "div",
  { className: "hc-root", style: { maxWidth: 1200, margin: "0 auto", padding: "32px 24px 96px" } },
  h(
    "header",
    { style: { display: "flex", alignItems: "center", gap: 16, marginBottom: 8 } },
    h(FortressMark, { size: 40 }),
    h(
      "div",
      null,
      h(
        "h1",
        { className: "hc-display", style: { margin: 0, fontSize: 22 } },
        "HighCastle UI — Nocturne Signal",
      ),
      h(
        "p",
        { style: { margin: "4px 0 0", color: "var(--hc-muted)", fontSize: 13 } },
        "Component gallery. All content below is labelled sample fixture data, not live scan results.",
      ),
    ),
  ),
  h(Callout, {
    tone: "policy",
    title: SAMPLE,
    children:
      "Screens, routes and data ownership belong to feature lanes; this file demonstrates the reusable foundation only.",
  }),

  h(
    Section,
    {
      title: "Identity",
      note: "Original 12x12 fortress mark + wordmark. No third-party pixel art.",
    },
    h(
      Row,
      null,
      h(FortressLogo, { withWordmark: true, size: 36 }),
      h(FortressMark, { size: 36, tone: "cyan" }),
      h(FortressMark, { size: 36, tone: "violet" }),
      h(FortressMark, { size: 20, tone: "current", className: undefined }),
    ),
  ),

  h(
    Section,
    { title: "Buttons" },
    h(
      Row,
      null,
      h(Button, null, "Run verification"),
      h(Button, { variant: "secondary", icon: "download" }, "Export evidence"),
      h(Button, { variant: "ghost" }, "View docs"),
      h(Button, { variant: "destructive", icon: "x" }, "Cancel scan"),
    ),
    h(
      Row,
      null,
      h(Button, { size: "sm" }, "Small"),
      h(Button, { size: "lg", icon: "beacon" }, "Try controlled demo"),
      h(Button, { loading: true }, "Validating plan"),
      h(Button, { disabled: true }, "Disabled"),
      h(IconButton, { icon: "copy", label: "Copy value" }),
    ),
  ),

  h(
    Section,
    {
      title: "Status — three independent axes",
      note: "Severity, confidence and remediation are separate chips, each icon + text + tone.",
    },
    h(
      Row,
      null,
      h(SeverityBadge, { severity: "critical" }),
      h(SeverityBadge, { severity: "high" }),
      h(SeverityBadge, { severity: "medium" }),
      h(SeverityBadge, { severity: "low" }),
      h(SeverityBadge, { severity: "informational" }),
    ),
    h(
      Row,
      null,
      h(SeverityMeter, { severity: "critical" }),
      h(SeverityMeter, { severity: "high" }),
      h(SeverityMeter, { severity: "medium" }),
      h(SeverityMeter, { severity: "low" }),
      h(SeverityMeter, { severity: "informational" }),
    ),
    h(
      Row,
      null,
      h(ConfidenceBadge, { confidence: "suspected" }),
      h(ConfidenceBadge, { confidence: "supported_by_analysis" }),
      h(ConfidenceBadge, { confidence: "confirmed_by_execution" }),
      h(ConfidenceBadge, { confidence: "not_reproduced" }),
      h(ConfidenceBadge, { confidence: "inconclusive" }),
    ),
    h(
      Row,
      null,
      h(RemediationBadge, { status: "open" }),
      h(RemediationBadge, { status: "in_progress" }),
      h(RemediationBadge, { status: "pending_verification" }),
      h(RemediationBadge, { status: "verified_fixed" }),
      h(RemediationBadge, { status: "accepted_risk" }),
      h(RemediationBadge, { status: "dismissed" }),
      h(RemediationBadge, { status: "reopened" }),
    ),
  ),

  h(
    Section,
    { title: "Run state" },
    h(
      Row,
      null,
      h(VerdictBadge, { verdict: "reproduced" }),
      h(VerdictBadge, { verdict: "not_reproduced" }),
      h(VerdictBadge, { verdict: "inconclusive" }),
      h(VerdictBadge, { verdict: "verified_fixed" }),
      h(VerdictBadge, { verdict: "still_vulnerable" }),
      h(VerdictBadge, { verdict: "regression" }),
    ),
    h(
      Row,
      null,
      h(ScanStatusBadge, { status: "queued" }),
      h(ScanStatusBadge, { status: "planning" }),
      h(ScanStatusBadge, { status: "executing" }),
      h(ScanStatusBadge, { status: "completed" }),
      h(ScanStatusBadge, { status: "partial" }),
      h(ScanStatusBadge, { status: "failed" }),
      h(ScanStatusBadge, { status: "canceled" }),
    ),
    h(
      Row,
      null,
      h(PhaseBadge, { phase: "planning" }),
      h(AttemptStatusBadge, { status: "blocked" }),
      h(AssertionChip, { outcome: "pass" }),
      h(AssertionChip, { outcome: "fail" }),
      h(AssertionChip, { outcome: "denied" }),
      h(AssertionChip, { outcome: "unknown" }),
    ),
    h(
      Row,
      null,
      h(ActorBadge, { actor: "model" }),
      h(ActorBadge, { actor: "policy" }),
      h(ActorBadge, { actor: "runner" }),
      h(ActorBadge, { actor: "oracle" }),
      h(ActorBadge, { actor: "user" }),
      h(StatusPill, { tone: "cyan", icon: "terminal", notched: true, label: "Executed output" }),
    ),
  ),

  h(
    Section,
    { title: "Navigation" },
    h(
      "div",
      { style: { border: "1px solid var(--hc-line)", borderRadius: 6, overflow: "hidden" } },
      h(TopBar, { actions: h(Button, { size: "sm", variant: "secondary" }, "Workspace") }),
      h(
        "div",
        { style: { display: "flex", minHeight: 220 } },
        h(NavRail, {
          activeKey: "scans",
          sections: [
            {
              key: "w",
              label: "Workspace",
              items: [
                { key: "overview", label: "Overview", href: "#", icon: "activity" },
                { key: "projects", label: "Projects", href: "#", icon: "layers" },
                { key: "scans", label: "Scans", href: "#", icon: "beacon", badge: 1 },
                { key: "findings", label: "Findings", href: "#", icon: "alert-octagon", badge: 3 },
              ],
            },
            {
              key: "s",
              label: "System",
              items: [
                { key: "reports", label: "Reports", href: "#", icon: "file" },
                { key: "settings", label: "Settings", href: "#", icon: "settings" },
              ],
            },
          ],
        }),
        h(
          "div",
          { style: { flex: 1, padding: 16, color: "var(--hc-subtle)", fontSize: 13 } },
          "Content region",
        ),
      ),
    ),
  ),

  h(
    Section,
    { title: "Header + stepper" },
    h(StatusHeader, {
      title: "Scan sc_01J8X4",
      badges: h(ScanStatusBadge, { status: "executing" }),
      meta: h(
        "span",
        null,
        "invoice-saas-lab · synthetic target · elapsed 00:23 · ",
        h(SnapshotPill, { revision: "a94e1c2f3b7d9012" }),
      ),
      actions: h(Button, { variant: "destructive", size: "sm" }, "Cancel"),
    }),
    h(Stepper, {
      current: 2,
      steps: [
        { key: "type", label: "Assessment type" },
        { key: "env", label: "Environment" },
        { key: "pack", label: "Test pack" },
        { key: "scope", label: "Scope review" },
        { key: "confirm", label: "Confirm" },
      ],
    }),
  ),

  h(
    Section,
    { title: "Forms" },
    h(
      "div",
      {
        style: {
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
        },
      },
      h(
        Field,
        { label: "Target host", required: true, hint: "Verified synthetic lab only" },
        h(TextInput, { placeholder: "target-lab.internal", mono: true }),
      ),
      h(Field, { label: "Test pack" }, h(Select, null, h("option", null, "bola-invoice-v1"))),
      h(
        Field,
        { label: "Reason", error: "Required before an active test" },
        h(TextArea, { error: true, placeholder: "Why this check is authorized" }),
      ),
      h(
        Field,
        { label: "Authorization" },
        h(Checkbox, {
          label: "I confirm recorded scope for this owned lab",
          hint: "Required — no self-approval",
        }),
      ),
    ),
  ),

  h(
    Section,
    {
      title: "Timeline",
      note: "Model=violet, executed=cyan, oracle=mint. Real persisted events only.",
    },
    h(
      "div",
      { style: { maxWidth: 640 } },
      h(Timeline, {
        events: [
          {
            id: "1",
            title: "Vultr model proposed hypothesis",
            actor: "model",
            phase: "planning",
            status: "done",
            timestamp: "08:00:12Z",
            detail: "BOLA across /api/invoices/{id} for tenant roles",
            expanded: h(
              "span",
              null,
              "Proposed pack: bola-invoice-v1 · GET only · ≤8 requests · synthetic roles alice/bob",
            ),
          },
          {
            id: "2",
            title: "Policy validated test pack",
            actor: "policy",
            phase: "planning",
            status: "done",
            timestamp: "08:00:13Z",
          },
          {
            id: "3",
            title: "Sandbox created; limits enforced",
            actor: "runner",
            phase: "preparing",
            status: "done",
            timestamp: "08:00:15Z",
          },
          {
            id: "4",
            title: "Alice → Alice baseline allowed",
            actor: "runner",
            phase: "executing",
            status: "done",
            timestamp: "08:00:17Z",
            detail: "HTTP 200 · own synthetic invoice",
          },
          {
            id: "5",
            title: "Alice → Bob boundary check",
            actor: "runner",
            phase: "executing",
            status: "active",
            timestamp: "08:00:18Z",
            detail: h(TimelineLiveIndicator, null, "executing GET /api/invoices/inv_B"),
          },
          {
            id: "6",
            title: "Independent oracle verdict",
            actor: "oracle",
            phase: "verifying",
            status: "pending",
          },
          {
            id: "7",
            title: "Egress attempt blocked",
            actor: "policy",
            status: "blocked",
            detail: "sandbox.action_blocked recorded",
          },
        ],
      }),
    ),
  ),

  h(
    Section,
    { title: "Evidence + code" },
    h(
      "div",
      {
        style: {
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 16,
        },
      },
      h(EvidenceCard, {
        kind: "redacted_response",
        title: "GET /api/invoices/inv_B → 200",
        hash: "sha256:9f2cd41b6a0f77e2c8a1b5d39e04c7a2f11e8d2c6b90a4f5e1c3d7b9a2e4f601",
        attemptRef: "attempt at_01J8XC",
        actions: h(Button, { size: "sm", variant: "secondary", icon: "eye" }, "Preview"),
      }),
      h(EvidenceCard, {
        kind: "containment",
        title: "sandbox.action_blocked",
        hash: "sha256:41b9e0c2d7f4a6b1c8d3e5f7a9b0c2d4e6f8a1b3c5d7e9f0a2b4c6d8e0f2a4b6",
        attemptRef: "runner rn_77",
        children: h(
          "span",
          { style: { fontSize: 13, color: "var(--hc-muted)" } },
          "Egress to api.external denied by policy network.egress_denied.",
        ),
      }),
      h(EvidenceCard, {
        kind: "oracle",
        title: "bola-oracle-v1 report",
        hash: "sha256:77aa10fe",
        attemptRef: "scan sc_01J8X4",
        redacted: false,
      }),
    ),
    h(CodeBlock, {
      language: "http",
      title: "attempt at_01J8XC · response excerpt (redacted)",
      lineNumbers: true,
      code: 'GET /api/invoices/inv_B HTTP/1.1\nHost: target-lab.internal\nX-Test-Identity: alice\n\nHTTP/1.1 200 OK\nContent-Type: application/json\n\n{"invoice_id":"inv_B","tenant":"tenant_B","total":"SYNTHETIC-ONLY"}',
    }),
    h(
      Row,
      null,
      h(SnapshotPill, { revision: "a94e1c2f3b7d9012e4" }),
      h(CopyButton, { value: "pnpm --filter @highcastle/ui example", label: "Copy command" }),
      h(
        "span",
        { className: "hc-mono", style: { color: "var(--hc-subtle)", fontSize: 12 } },
        "copy affordances",
      ),
    ),
  ),

  h(
    Section,
    { title: "Replay — before/after assertions" },
    h(ReplayDiff, {
      before: {
        label: "Before · vulnerable",
        environment: "lab-v1",
        assertions: [
          {
            key: "1",
            label: "Alice → Bob private invoice",
            result: "fail",
            observed: "200 · synthetic invoice body",
          },
          { key: "2", label: "Alice → Alice own invoice", result: "pass", observed: "200" },
        ],
        summary: "1 confirmed attack path (sample fixture)",
        traceAction: h(Button, { size: "sm", variant: "ghost", icon: "terminal" }, "Proof trace"),
      },
      after: {
        label: "After · patched",
        environment: "lab-v2",
        assertions: [
          { key: "1", label: "Alice → Bob private invoice", result: "denied", observed: "403" },
          { key: "2", label: "Alice → Alice own invoice", result: "pass", observed: "200" },
        ],
        summary: "0 reproduced · positive control passes",
        traceAction: h(
          Button,
          { size: "sm", variant: "ghost", icon: "terminal" },
          "New proof trace",
        ),
      },
      verdict: h(Callout, {
        tone: "success",
        title: "Verified fixed for this attack path",
        children:
          "Both assertions passed in replay (sample fixture). Other attack classes were not tested.",
      }),
    }),
  ),

  h(
    Section,
    { title: "Scope + containment ledger" },
    h(
      "div",
      {
        style: {
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          gap: 16,
        },
      },
      h(ScopePanel, {
        entries: [
          { label: "Target host", value: "target-lab.internal" },
          { label: "Test pack", value: "bola-invoice-v1" },
          { label: "Identities", value: "alice, bob (synthetic)" },
          { label: "Methods", value: "GET · ≤8 requests · 30s" },
          { label: "Expires", value: "2026-11-08T00:00Z" },
        ],
        footer: "Recorded authorization — the demo cannot alter this scope.",
      }),
      h(ContainmentLedger, {
        entries: [
          { key: "net", label: "Network egress", status: "enforced", value: "restricted" },
          { key: "fs", label: "Host mounts", status: "enforced", value: "none" },
          { key: "sec", label: "Secret access", status: "blocked", value: "1 denial · recorded" },
          { key: "res", label: "Resource caps", status: "enforced", value: "cpu/mem/req limits" },
          { key: "blk", label: "Last block", status: "clear", value: "none this run" },
        ],
      }),
    ),
  ),

  h(
    Section,
    { title: "Result states" },
    h(
      "div",
      {
        style: {
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 16,
        },
      },
      h(
        Panel,
        null,
        h(EmptyState, {
          title: "No scans yet",
          children: "Connect a verified target to run the first authorized assessment.",
          actions: h(Button, { size: "sm" }, "New assessment"),
        }),
      ),
      h(
        Panel,
        null,
        h(ErrorState, {
          title: "Scan failed",
          diagnostic: "err_9f2c",
          children:
            "The runner exited before completing the pack. Events up to the failure are preserved.",
          actions: h(Button, { size: "sm", variant: "secondary" }, "Retry scan"),
        }),
      ),
      h(
        Panel,
        null,
        h(InconclusiveState, {
          actions: h(Button, { size: "sm", variant: "secondary" }, "View evidence"),
        }),
      ),
      h(
        Panel,
        null,
        h(BlockedState, {
          reference: "network.egress_denied",
          actions: h(Button, { size: "sm", variant: "ghost" }, "Read policy"),
        }),
      ),
      h(Panel, null, h(LoadingState, { label: "Restoring scan events" })),
    ),
  ),

  h(
    Section,
    { title: "Tabs + modal (static markup)" },
    h(Tabs, {
      "aria-label": "Finding detail",
      items: [
        {
          key: "ov",
          label: "Overview",
          panel: h(
            "p",
            { style: { color: "var(--hc-muted)", fontSize: 14 } },
            "Builder summary in plain language.",
          ),
        },
        {
          key: "pf",
          label: "Proof",
          count: 4,
          panel: h(
            "p",
            { style: { color: "var(--hc-muted)", fontSize: 14 } },
            "Request, response, oracle assertion.",
          ),
        },
        {
          key: "rp",
          label: "Replay",
          panel: h(
            "p",
            { style: { color: "var(--hc-muted)", fontSize: 14 } },
            "Before/after verification.",
          ),
        },
        {
          key: "fx",
          label: "Fix",
          panel: h(
            "p",
            { style: { color: "var(--hc-muted)", fontSize: 14 } },
            "Invariant and guidance.",
          ),
        },
      ],
    }),
    h(
      "div",
      {
        style: {
          position: "relative",
          border: "1px dashed var(--hc-line)",
          borderRadius: 6,
          padding: 24,
        },
      },
      h(
        "p",
        { style: { margin: "0 0 12px", color: "var(--hc-subtle)", fontSize: 12 } },
        "Modal anatomy (inline mock of the portal output):",
      ),
      h(
        "div",
        { className: "hc-modal hc-modal--sm", style: { maxWidth: 420, margin: "0 auto" } },
        h(
          "div",
          { className: "hc-modal-header" },
          h(
            "div",
            null,
            h("h2", { className: "hc-modal-title" }, "Cancel scan?"),
            h(
              "p",
              { className: "hc-modal-description" },
              "The runner is stopped and cleanup is recorded.",
            ),
          ),
          h(
            "button",
            { className: "hc-icon-btn hc-modal-close", "aria-label": "Close dialog" },
            "×",
          ),
        ),
        h(
          "div",
          { className: "hc-modal-body" },
          "In-flight requests are discarded; persisted events remain available.",
        ),
        h(
          "div",
          { className: "hc-modal-footer" },
          h("button", { className: "hc-btn hc-btn--ghost" }, "Keep running"),
          h("button", { className: "hc-btn hc-btn--destructive" }, "Cancel scan"),
        ),
      ),
    ),
  ),

  h(
    Section,
    {
      title: "Illustration primitives",
      wide: true,
      note: "Original artwork for hero, proof and containment surfaces.",
    },
    h(
      "div",
      {
        style: {
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))",
          gap: 24,
        },
      },
      h(
        Panel,
        null,
        h(PanelHeader, { title: "Perimeter under test" }),
        h(PanelBody, null, h(PerimeterArt, { width: 460 })),
      ),
      h(
        Panel,
        null,
        h(PanelHeader, { title: "Containment" }),
        h(PanelBody, null, h(ContainmentDiagram, { width: 460 })),
      ),
      h(
        Panel,
        null,
        h(PanelHeader, { title: "Proof chain" }),
        h(PanelBody, null, h(ProofChainDiagram, { width: 440 })),
      ),
    ),
  ),
) as ReactElement;

const body = renderToStaticMarkup(page);

const htmlDoc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>HighCastle UI — Nocturne Signal gallery</title>
<link rel="icon" href="../../apps/web/public/brand/favicon.svg" type="image/svg+xml" />
<link rel="stylesheet" href="./styles/index.css" />
<style>
  body { margin: 0; }
</style>
</head>
<body class="hc-root">
${body}
</body>
</html>
`;

mkdirSync(outDir, { recursive: true });
mkdirSync(outDir + "styles", { recursive: true });
for (const f of ["tokens.css", "components.css", "index.css", "theme.css"]) {
  copyFileSync(stylesDir + f, outDir + "styles/" + f);
}
writeFileSync(outDir + "gallery.html", htmlDoc);
console.log("wrote packages/ui/examples/gallery.html");
