import { describe, expect, it } from "vitest";
import { MODE_COOKIE, MODE_LABEL, isDeveloperOnlySection, modeNavLabel, resolveMode } from "./mode";
import {
  appPaths,
  getProjectSections,
  getWorkspaceSections,
  workspaceCrumbs,
  workspacePath,
} from "./nav";

describe("experience mode", () => {
  it("defaults to builder and only honors the developer value", () => {
    expect(resolveMode(null)).toBe("builder");
    expect(resolveMode(undefined)).toBe("builder");
    expect(resolveMode("admin")).toBe("builder");
    expect(resolveMode("developer")).toBe("developer");
    expect(MODE_COOKIE).toBe("hc-mode");
    expect(MODE_LABEL.builder).toBe("Builder");
  });

  it("builder aliases change labels only — never hrefs", () => {
    expect(modeNavLabel("builder", "Findings")).toBe("Issues found");
    expect(modeNavLabel("builder", "Overview")).toBe("Overview");
    expect(modeNavLabel("developer", "Findings")).toBe("Findings");
  });

  it("marks developer-only sections", () => {
    expect(isDeveloperOnlySection("developers")).toBe(true);
    expect(isDeveloperOnlySection("automation")).toBe(true);
    expect(isDeveloperOnlySection("workspace")).toBe(false);
  });
});

describe("route builders (L09/L10 contract)", () => {
  it("builds workspace-scoped paths", () => {
    expect(workspacePath("demo")).toBe("/app/w/demo");
    expect(appPaths.overview("demo")).toBe("/app/w/demo/overview");
    expect(appPaths.projectOverview("demo", "p1")).toBe("/app/w/demo/projects/p1/overview");
    expect(appPaths.scanDetail("demo", "p1", "s1")).toBe("/app/w/demo/projects/p1/scans/s1");
    expect(appPaths.scanLive("demo", "p1", "s1")).toBe("/app/w/demo/projects/p1/scans/s1/live");
    expect(appPaths.findingDetail("demo", "p1", "f1")).toBe(
      "/app/w/demo/projects/p1/findings/f1/overview",
    );
    expect(appPaths.replayDetail("demo", "p1", "f1", "r1")).toContain("/replay?replay=r1");
    expect(appPaths.newScan("demo", "p1")).toBe("/app/w/demo/projects/p1/scans/new");
    expect(appPaths.scopePolicy("demo", "p1")).toBe("/app/w/demo/projects/p1/policy/scope");
  });

  it("sign-in links carry a validated relative returnTo", () => {
    // The auth route group /(auth)/sign-in serves public path /sign-in;
    // /auth/sign-in does not exist (no such route, no rewrite).
    const href = appPaths.signIn("/app/w/demo/overview");
    expect(href).toBe("/sign-in?returnTo=%2Fapp%2Fw%2Fdemo%2Foverview");
    expect(href.startsWith("/sign-in?returnTo=%2F")).toBe(true);
  });

  it("workspace sections link every entity to its real route", () => {
    const sections = getWorkspaceSections("demo", "builder", { openScans: 2 });
    const hrefs = sections.flatMap((section) => section.items.map((item) => item.href));
    expect(hrefs).toContain("/app/w/demo/overview");
    expect(hrefs).toContain("/app/w/demo/projects");
    expect(hrefs).toContain("/app/w/demo/scans");
    const scans = sections.flatMap((section) => section.items).find((item) => item.key === "scans");
    expect(scans?.badge).toBe(2);
  });

  it("builder hides developer-only sections without changing hrefs", () => {
    const builderKeys = getWorkspaceSections("demo", "builder").flatMap((section) =>
      section.items.map((item) => item.key),
    );
    const developerKeys = getWorkspaceSections("demo", "developer").flatMap((section) =>
      section.items.map((item) => item.key),
    );
    expect(builderKeys).not.toContain("api-keys");
    expect(developerKeys).toContain("api-keys");
    const both = (key: string) =>
      getWorkspaceSections("demo", "builder")
        .flatMap((s) => s.items)
        .find((i) => i.key === key)?.href ===
      getWorkspaceSections("demo", "developer")
        .flatMap((s) => s.items)
        .find((i) => i.key === key)?.href;
    expect(both("overview")).toBe(true);
  });

  it("project sections expose the L09/L10 attachment points", () => {
    const sections = getProjectSections("demo", "p1", "developer", 1);
    const hrefs = sections.flatMap((section) => section.items.map((item) => item.href));
    expect(hrefs).toContain("/app/w/demo/projects/p1/overview");
    expect(hrefs).toContain("/app/w/demo/projects/p1/scans");
    expect(hrefs).toContain("/app/w/demo/projects/p1/findings");
    expect(hrefs).toContain("/app/w/demo/projects/p1/policy/scope");
    const scans = sections
      .flatMap((section) => section.items)
      .find((item) => item.key === "project-scans");
    expect(scans?.badge).toBe(1);
  });

  it("crumbs keep workspace context first", () => {
    expect(workspaceCrumbs("Demo", [{ label: "Overview" }])).toEqual([
      { label: "Demo" },
      { label: "Overview" },
    ]);
  });
});
