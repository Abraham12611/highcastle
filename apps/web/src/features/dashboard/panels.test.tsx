import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  FailedPanel,
  FindingList,
  ReadinessChecklist,
  ScanList,
  ScopeSummaryPanel,
  UnauthorizedPanel,
} from "./panels";
import { STORY_FINDINGS, STORY_SCANS, STORY_SCOPE } from "./fixtures";

/** No-JSX static-markup assertions (web tsconfig keeps `jsx: preserve`). */
const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const items = STORY_SCANS.map((scan) => ({ scan, projectId: "p1" }));

describe("honest states (no fabricated data)", () => {
  it("empty scans explain the next step with a CTA", () => {
    const out = html(
      h(ScanList, {
        workspaceSlug: "demo",
        items: [],
        newScanHref: "/app/w/demo/projects/p1/scans/new",
      }),
    );
    expect(out).toContain("No scans recorded");
    expect(out).toContain("Run the first assessment");
    expect(out).toContain("/app/w/demo/projects/p1/scans/new");
  });

  it("empty findings use the no-reproduction caveat, never 'secure'", () => {
    const out = html(h(FindingList, { workspaceSlug: "demo", findings: [], developer: false }));
    expect(out).toContain("No issues reproduced within tested coverage");
    expect(out.toLowerCase()).not.toContain("secure");
    expect(out.toLowerCase()).not.toContain("risk score");
  });

  it("failed panels name the failure and offer retry with the request id", () => {
    const out = html(
      h(FailedPanel, {
        title: "Project overview unavailable",
        message: "The API is unreachable.",
        requestId: "req-9",
        retryHref: "/app/w/demo/projects/p1/overview",
      }),
    );
    expect(out).toContain("Project overview unavailable");
    expect(out).toContain("The API is unreachable.");
    expect(out).toContain("Try again");
    expect(out).toContain("ref: req-9");
  });

  it("unauthorized states never leak data and link sign-in only when signed out", () => {
    const signedOut = html(
      h(UnauthorizedPanel, { returnTo: "/app/w/demo/overview", reason: "signed-out" }),
    );
    expect(signedOut).toContain("Sign in required");
    expect(signedOut).toContain("/auth/sign-in?returnTo=%2Fapp%2Fw%2Fdemo%2Foverview");
    const noAccess = html(
      h(UnauthorizedPanel, { returnTo: "/app/w/demo/overview", reason: "no-access" }),
    );
    expect(noAccess).toContain("No access to this workspace");
    expect(noAccess).not.toContain("/auth/sign-in");
  });

  it("readiness lists pass/fail per check without invented blockers", () => {
    const out = html(
      h(ReadinessChecklist, {
        items: [
          { key: "target", label: "Target verified", ok: true, detail: "lab · verified" },
          {
            key: "scope",
            label: "Scope active",
            ok: false,
            detail: "no approved scope",
            href: "/scope",
          },
        ],
      }),
    );
    expect(out).toContain("Target verified");
    expect(out).toContain("Scope active");
    expect(out).toContain("Review");
    expect(out).toContain("1 readiness check failing");
  });

  it("scan rows link to L09 routes with recorded counts", () => {
    const out = html(h(ScanList, { workspaceSlug: "demo", items, newScanHref: "/new" }));
    expect(out).toContain("/app/w/demo/projects/p1/scans/c0c0c0c0-0000-4000-8000-000000000010");
    expect(out).toContain("bola-invoice-v1");
    expect(out).toContain("lab-v1-vulnerable");
    expect(out).toContain("1 of 1 checks run");
  });

  it("finding rows link to L10 routes with severity and confidence text", () => {
    const out = html(
      h(FindingList, { workspaceSlug: "demo", findings: STORY_FINDINGS, developer: false }),
    );
    expect(out).toContain(
      "/app/w/demo/projects/a0a0a0a0-0000-4000-8000-000000000002/findings/d0d0d0d0-0000-4000-8000-000000000020/overview",
    );
    expect(out).toContain("Invoice lookup missing ownership check");
    expect(out).not.toContain("risk score");
  });

  it("scope panel renders the recorded grant without management controls", () => {
    const out = html(h(ScopeSummaryPanel, { scope: STORY_SCOPE }));
    expect(out).toContain("target-lab");
    expect(out).toContain("bola-invoice-v1");
    expect(out).toContain("read-only");
    expect(out).not.toContain("Approve");
  });
});
