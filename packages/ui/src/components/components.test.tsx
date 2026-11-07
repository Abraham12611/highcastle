import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ActorBadge,
  AttemptStatusBadge,
  ConfidenceBadge,
  RemediationBadge,
  ScanStatusBadge,
  SeverityBadge,
  SeverityMeter,
  StatusPill,
  VerdictBadge,
} from "./badge.js";
import { Button, IconButton } from "./button.js";
import { CodeBlock } from "./code-block.js";
import { EvidenceCard } from "./evidence-card.js";
import { Checkbox, Field, TextInput } from "./form.js";
import { FortressLogo, FortressMark, fortressPathD, FORTRESS_GRID } from "./logo.js";
import { Modal } from "./modal.js";
import { NavRail, TopBar } from "./nav.js";
import { ReplayDiff } from "./replay-diff.js";
import { ScopePanel } from "./scope-panel.js";
import { EmptyState, ErrorState, InconclusiveState, LoadingState, BlockedState } from "./states.js";
import { StatusHeader } from "./status-header.js";
import { Stepper } from "./stepper.js";
import { Tabs } from "./tabs.js";
import { Timeline } from "./timeline.js";

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe("Button", () => {
  it("renders primary with pixel shadow class and explicit label", () => {
    const out = html(<Button>Run verification</Button>);
    expect(out).toContain("hc-btn--primary");
    expect(out).toContain("Run verification");
    expect(out).toContain('type="button"');
  });
  it("blocks repeat presses and reports busy while loading", () => {
    const out = html(<Button loading>Saving</Button>);
    expect(out).toContain("disabled");
    expect(out).toContain('aria-busy="true"');
    expect(out).toContain("hc-spinner");
  });
  it("icon buttons carry an accessible name", () => {
    const out = html(<IconButton icon="x" label="Close dialog" />);
    expect(out).toContain('aria-label="Close dialog"');
  });
});

describe("status badges — three independent axes", () => {
  it("severity pairs icon and text, never color only", () => {
    const out = html(<SeverityBadge severity="critical" />);
    expect(out).toContain("hc-pill--coral");
    expect(out).toContain("Critical");
    expect(out).toContain("hc-icon");
  });
  it("confidence is a separate axis from severity", () => {
    const out = html(<ConfidenceBadge confidence="confirmed_by_execution" />);
    expect(out).toContain("hc-pill--cyan");
    expect(out).toContain("Confirmed by execution");
  });
  it("remediation status is independent again", () => {
    const out = html(<RemediationBadge status="verified_fixed" />);
    expect(out).toContain("hc-pill--success");
    expect(out).toContain("Verified fixed");
  });
  it("oracle and replay verdicts render distinctly", () => {
    expect(html(<VerdictBadge verdict="reproduced" />)).toContain("hc-pill--coral");
    expect(html(<VerdictBadge verdict="inconclusive" />)).toContain("Inconclusive");
    expect(html(<VerdictBadge verdict="still_vulnerable" />)).toContain("Still vulnerable");
  });
  it("model hypothesis reads violet; execution cyan; oracle mint", () => {
    expect(html(<ActorBadge actor="model" />)).toContain("hc-pill--violet");
    expect(html(<ActorBadge actor="runner" />)).toContain("hc-pill--cyan");
    expect(html(<ActorBadge actor="oracle" />)).toContain("hc-pill--success");
  });
  it("scan status marks live phases with a pulse dot", () => {
    const out = html(<ScanStatusBadge status="executing" />);
    expect(out).toContain("hc-pulse-dot");
    expect(out).toContain("Executing");
    expect(html(<ScanStatusBadge status="failed" />)).toContain("hc-pill--coral");
  });
  it("attempt status covers blocked", () => {
    expect(html(<AttemptStatusBadge status="blocked" />)).toContain("Blocked");
  });
  it("severity meter exposes a textual role", () => {
    const out = html(<SeverityMeter severity="high" />);
    expect(out).toContain('role="img"');
    expect(out).toContain("Severity: High");
  });
  it("notched pill renders the HighCastle chip silhouette", () => {
    expect(html(<StatusPill tone="cyan" notched label="Executed" />)).toContain("hc-pill--notched");
  });
});

describe("FortressMark logo", () => {
  it("renders the 12x12 fortress grid", () => {
    expect(FORTRESS_GRID).toHaveLength(12);
    expect(FORTRESS_GRID.every((row) => row.length === 12)).toBe(true);
    expect(fortressPathD()).toContain("M0 0h1v1h-1z");
  });
  it("is symmetric (two towers)", () => {
    for (const row of FORTRESS_GRID) {
      expect(row).toBe(row.split("").reverse().join(""));
    }
  });
  it("has an accessible label standalone, silent inside a lockup", () => {
    expect(html(<FortressMark />)).toContain('aria-label="HighCastle"');
    expect(html(<FortressLogo withWordmark />)).toContain("aria-hidden");
    expect(html(<FortressLogo withWordmark />)).toContain("HighCastle");
  });
});

describe("forms", () => {
  it("Field wires label, error and required marker", () => {
    const out = html(
      <Field label="Target host" required error="Required for scope">
        <TextInput name="host" error />
      </Field>,
    );
    expect(out).toContain('for="');
    expect(out).toContain('role="alert"');
    expect(out).toContain('aria-invalid="true"');
  });
  it("Checkbox renders a labelled control", () => {
    const out = html(<Checkbox label="I authorize this scope" />);
    expect(out).toContain('type="checkbox"');
    expect(out).toContain("I authorize this scope");
  });
});

describe("navigation", () => {
  it("NavRail marks the active item with aria-current", () => {
    const out = html(
      <NavRail
        sections={[
          {
            key: "main",
            items: [
              { key: "overview", label: "Overview", href: "/w/x" },
              { key: "findings", label: "Findings", href: "/w/x/findings", badge: 2 },
            ],
          },
        ]}
        activeKey="findings"
      />,
    );
    expect(out).toContain('aria-current="page"');
    expect(out).toContain("hc-nav-item--active");
  });
  it("TopBar renders brand and actions slots", () => {
    const out = html(<TopBar actions={<button>Profile</button>} />);
    expect(out).toContain("hc-topbar");
    expect(out).toContain("Profile");
  });
});

describe("tabs", () => {
  it("emits tablist/tab/tabpanel semantics with roving tabindex", () => {
    const out = html(
      <Tabs
        aria-label="Finding detail"
        items={[
          { key: "overview", label: "Overview", panel: <p>one</p> },
          { key: "proof", label: "Proof", panel: <p>two</p> },
        ]}
      />,
    );
    expect(out).toContain('role="tablist"');
    expect(out).toContain('role="tab"');
    expect(out).toContain('aria-selected="true"');
    expect(out).toContain('role="tabpanel"');
    expect(out).toContain('tabindex="-1"');
  });
});

describe("stepper", () => {
  it("marks the current step", () => {
    const out = html(
      <Stepper
        steps={[
          { key: "type", label: "Type" },
          { key: "scope", label: "Scope" },
          { key: "confirm", label: "Confirm" },
        ]}
        current={1}
      />,
    );
    expect(out).toContain('aria-current="step"');
    expect(out).toContain("hc-step--done");
  });
});

describe("timeline", () => {
  const events = [
    {
      id: "e1",
      title: "Model proposed hypothesis",
      status: "done" as const,
      actor: "model" as const,
      timestamp: "2026-11-07T08:00:00Z",
    },
    { id: "e2", title: "Policy validated pack", status: "done" as const, actor: "policy" as const },
    {
      id: "e3",
      title: "Alice→Bob boundary check",
      status: "active" as const,
      actor: "runner" as const,
      detail: "executing GET /invoices/inv_B",
    },
    { id: "e4", title: "Independent oracle", status: "pending" as const, actor: "oracle" as const },
  ];
  it("renders sequence, actor badges and current step", () => {
    const out = html(<Timeline events={events} />);
    expect(out).toContain('aria-current="step"');
    expect(out).toContain("Alice→Bob boundary check");
    expect(out).toContain("Model");
    expect(out).toContain("Policy");
    expect(out).toContain("Oracle");
    expect(out).toContain("hc-timeline-item--done");
    expect(out).toContain("hc-timeline-item--active");
  });
});

describe("evidence", () => {
  it("shows artifact kind, redaction and integrity hash", () => {
    const out = html(
      <EvidenceCard
        kind="redacted_response"
        title="GET /api/invoices/inv_B → 200"
        hash="sha256:9f2c…d41b"
        attemptRef="attempt at_01J8X"
        redacted
      />,
    );
    expect(out).toContain("Response (redacted)");
    expect(out).toContain("Redacted");
    expect(out).toContain("sha256:9f2c…d41b");
    expect(out).toContain("attempt at_01J8X");
  });
});

describe("code block", () => {
  it("escapes content and exposes a scrollable region", () => {
    const out = html(<CodeBlock code={'GET /x\n{"a": 1}'} language="http" lineNumbers />);
    expect(out).toContain('role="region"');
    expect(out).toContain('tabindex="0"');
    expect(out).toContain("{&quot;a&quot;: 1}");
    expect(out).toContain("hc-code--numbered");
  });
});

describe("replay diff", () => {
  it("shows negative and positive assertions side by side", () => {
    const out = html(
      <ReplayDiff
        before={{
          label: "Before · vulnerable",
          assertions: [
            { key: "a", label: "Alice → Bob invoice", result: "fail", observed: "200 + invoice" },
            { key: "b", label: "Alice → Alice invoice", result: "pass", observed: "200" },
          ],
        }}
        after={{
          label: "After · patched",
          assertions: [
            { key: "a", label: "Alice → Bob invoice", result: "denied", observed: "403" },
            { key: "b", label: "Alice → Alice invoice", result: "pass", observed: "200" },
          ],
        }}
      />,
    );
    expect(out).toContain("Before · vulnerable");
    expect(out).toContain("After · patched");
    expect(out).toContain("403");
    expect(out).toContain("hc-assertion--denied");
  });
});

describe("scope + header", () => {
  it("ScopePanel lists recorded authorization entries", () => {
    const out = html(
      <ScopePanel
        entries={[
          { label: "Target host", value: "target-lab.internal" },
          { label: "Packs", value: "bola-invoice-v1" },
        ]}
      />,
    );
    expect(out).toContain("Scope active");
    expect(out).toContain("target-lab.internal");
  });
  it("StatusHeader composes title, badges and actions", () => {
    const out = html(
      <StatusHeader
        title="Scan sc_01J8"
        badges={<ScanStatusBadge status="executing" />}
        meta={<span>elapsed 00:12</span>}
        actions={<button>Cancel</button>}
      />,
    );
    expect(out).toContain("Scan sc_01J8");
    expect(out).toContain("elapsed 00:12");
  });
});

describe("result states", () => {
  it("empty state ships original art by default", () => {
    const out = html(<EmptyState title="No scans yet" />);
    expect(out).toContain("<svg");
    expect(out).toContain("No scans yet");
  });
  it("error state shows a diagnostic reference", () => {
    const out = html(<ErrorState diagnostic="err_9f2c" />);
    expect(out).toContain("ref: err_9f2c");
  });
  it("loading state is a polite status region", () => {
    const out = html(<LoadingState label="Restoring scan events" />);
    expect(out).toContain('role="status"');
    expect(out).toContain("Restoring scan events");
  });
  it("inconclusive is honest — never styled as safe", () => {
    const out = html(<InconclusiveState />);
    expect(out).toContain("couldn&#x27;t establish");
    expect(out).not.toContain("hc-pill--success");
  });
  it("blocked state cites the execution boundary", () => {
    const out = html(<BlockedState reference="policy.egress" />);
    expect(out).toContain("execution boundary");
    expect(out).toContain("policy ref: policy.egress");
  });
});

describe("modal (SSR markup)", () => {
  it("renders nothing when closed", () => {
    expect(html(<Modal open={false} onClose={() => {}} title="x" />)).toBe("");
  });
});
