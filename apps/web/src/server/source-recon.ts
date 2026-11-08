/**
 * Source-only reconnaissance (L13) — pure analyzer.
 *
 * Consumes repository file listings + selected file contents already
 * fetched through the least-privilege adapter and produces honest,
 * source-referenced observations. Everything is labelled
 * "unverified" — metadata alone can never prove a runtime finding.
 */

export interface ReconEvidence {
  file: string;
  line?: number | undefined;
  detail: string;
}

export interface ReconObservation {
  key: string;
  title: string;
  detail: string;
  evidence: ReconEvidence[];
}

export interface SourceRecon {
  confidence: "unverified_source_analysis";
  summary: {
    manifests: string[];
    frameworks: string[];
    routeFiles: string[];
    authSignals: string[];
  };
  observations: ReconObservation[];
  limitations: string[];
}

const MANIFEST_NAMES = new Set([
  "package.json",
  "pnpm-workspace.yaml",
  "requirements.txt",
  "pyproject.toml",
  "go.mod",
  "Cargo.toml",
  "Gemfile",
  "composer.json",
  "pom.xml",
]);

const ROUTE_HINTS =
  /route\.(ts|tsx|js|jsx)|pages\/|app\/|app\.(ts|js|py)|urls\.py|main\.(go|rs)|routes\//i;
const AUTH_HINTS = /auth|session|jwt|token|middleware|guard|interceptor/i;

export function lineOf(haystack: string, needle: string | RegExp): number | undefined {
  const idx = haystack.search(needle);
  if (idx < 0) return undefined;
  return haystack.slice(0, idx).split("\n").length;
}

/** Analyze package.json contents (dependency + script metadata). */
export function analyzePackageJson(path: string, content: string): ReconObservation[] {
  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    pkg = JSON.parse(content) as typeof pkg;
  } catch {
    return [];
  }
  const obs: ReconObservation[] = [];
  const deps = { ...pkg.devDependencies, ...pkg.dependencies };
  const frameworks = ["next", "express", "fastify", "react", "vue", "nuxt", "@nestjs/core"];
  const found = frameworks.filter((f) => deps[f]);
  for (const f of found) {
    obs.push({
      key: `framework:${f}`,
      title: `Framework dependency: ${f}@${deps[f]}`,
      detail: "Declared in package manifest — presence does not prove the app is exploitable.",
      evidence: [{ file: path, line: lineOf(content, `"${f}"`), detail: `"${f}": "${deps[f]}"` }],
    });
  }
  const interesting = [
    "jsonwebtoken",
    "bcrypt",
    "passport",
    "cookie",
    "express-session",
    "next-auth",
  ];
  for (const d of interesting.filter((d) => deps[d])) {
    obs.push({
      key: `dep:${d}`,
      title: `Auth-related dependency: ${d}@${deps[d]}`,
      detail: "Dependency only — not evidence of a vulnerability.",
      evidence: [{ file: path, line: lineOf(content, `"${d}"`), detail: `"${d}": "${deps[d]}"` }],
    });
  }
  return obs;
}

/** Classify a repository path listing into recon buckets. */
export function classifyPaths(paths: string[]): {
  manifests: string[];
  routeFiles: string[];
  authSignals: string[];
} {
  const manifests = paths.filter((p) => MANIFEST_NAMES.has(p.split("/").pop() ?? ""));
  const routeFiles = paths.filter((p) => ROUTE_HINTS.test(p));
  const authSignals = paths.filter((p) => AUTH_HINTS.test(p));
  return { manifests, routeFiles, authSignals };
}

export function buildRecon(input: {
  paths: string[];
  frameworks: string[];
  observations: ReconObservation[];
}): SourceRecon {
  const { manifests, routeFiles, authSignals } = classifyPaths(input.paths);
  return {
    confidence: "unverified_source_analysis",
    summary: {
      manifests,
      frameworks: input.frameworks,
      routeFiles: routeFiles.slice(0, 25),
      authSignals: authSignals.slice(0, 25),
    },
    observations: input.observations,
    limitations: [
      "Source analysis only — nothing was executed or dynamically verified.",
      "Absence of a signal does not imply absence of a vulnerability.",
      "Repository scripts were never run; manifests were parsed as data.",
    ],
  };
}
