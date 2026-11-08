import { describe, expect, it } from "vitest";
import { analyzePackageJson, buildRecon, classifyPaths, lineOf } from "./source-recon";

const PKG = `{
  "name": "demo-app",
  "dependencies": {
    "next": "16.4.5",
    "jsonwebtoken": "9.0.2"
  }
}`;

describe("source recon", () => {
  it("lineOf returns 1-based line numbers", () => {
    expect(lineOf("a\nb\nc", "b")).toBe(2);
    expect(lineOf("a\nb\nc", "zzz")).toBeUndefined();
  });

  it("classifies manifests, route files and auth signals", () => {
    const { manifests, routeFiles, authSignals } = classifyPaths([
      "package.json",
      "apps/web/src/app/api/v1/scans/route.ts",
      "src/lib/auth/session.ts",
      "README.md",
      "server/middleware/authz.ts",
    ]);
    expect(manifests).toEqual(["package.json"]);
    expect(routeFiles.length).toBeGreaterThan(0);
    expect(authSignals).toContain("src/lib/auth/session.ts");
  });

  it("flags framework + auth deps with file:line evidence", () => {
    const obs = analyzePackageJson("package.json", PKG);
    const next = obs.find((o) => o.key === "framework:next");
    const jwt = obs.find((o) => o.key === "dep:jsonwebtoken");
    expect(next?.evidence[0]?.line).toBe(4);
    expect(jwt?.title).toContain("9.0.2");
    expect(next?.detail).toMatch(/does not prove/i);
  });

  it("labels the whole result unverified source analysis", () => {
    const recon = buildRecon({ paths: ["package.json"], frameworks: ["next"], observations: [] });
    expect(recon.confidence).toBe("unverified_source_analysis");
    expect(recon.limitations.length).toBeGreaterThan(0);
  });
});
