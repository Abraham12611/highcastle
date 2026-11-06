import { denyReason, type PolicyDenyReason } from "./decisions.js";

/**
 * Scoped path normalization and allow/deny matching.
 *
 * Scope `allowedPaths`/`deniedPaths` are absolute path prefixes. A request
 * path is permitted iff it matches at least one allowed entry and no denied
 * entry. Denied always wins. Matching is performed on a canonicalized path:
 * percent-decoded (bounded passes so `%252e%252e` double-encoding cannot
 * smuggle traversal), query/fragment stripped, duplicate slashes collapsed,
 * `..`/`.` segments rejected outright.
 *
 * Fail-closed rules:
 * - A path that cannot be normalized is never permitted.
 * - An allowed entry that cannot be normalized matches nothing.
 * - A denied entry that cannot be normalized matches EVERYTHING — a malformed
 *   deny rule must fail closed, not silently widen the surface.
 */

const MAX_PATH_LEN = 1024;
const MAX_DECODE_PASSES = 3;

export function normalizeScopedPath(raw: string): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_PATH_LEN) {
    return null;
  }
  // Strip query/fragment — they are never part of route scope and may carry
  // credentials (which redaction handles separately).
  let path = raw.split(/[?#]/, 1)[0] ?? "";
  if (!path.startsWith("/")) return null;

  // Bounded repeated decoding defeats double-encoded traversal.
  for (let i = 0; i < MAX_DECODE_PASSES; i++) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(path);
    } catch {
      return null;
    }
    if (decoded === path) break;
    path = decoded;
    if (i === MAX_DECODE_PASSES - 1) return null; // still changing — bail
  }

  if (path.includes("\0") || path.includes("\\")) return null;

  const segments = path.split("/");
  const kept: string[] = [];
  for (const seg of segments) {
    if (seg === "..") return null;
    if (seg === "" || seg === ".") continue;
    kept.push(seg);
  }
  if (kept.length === 0) return "/";
  return `/${kept.join("/")}`;
}

function normalizeScopeEntry(entry: string): string | null {
  return normalizeScopedPath(entry);
}

/** `entry` scope-matches `path` iff equal, a parent prefix, or root. */
export function pathMatchesScopeEntry(path: string, entry: string): boolean {
  const normalizedPath = normalizeScopedPath(path);
  const normalizedEntry = normalizeScopeEntry(entry);
  if (normalizedPath === null || normalizedEntry === null) return false;
  if (normalizedEntry === "/") return true;
  return normalizedPath === normalizedEntry || normalizedPath.startsWith(`${normalizedEntry}/`);
}

export interface PathCheckResult {
  permitted: boolean;
  /** Canonical path when normalization succeeded. */
  normalizedPath: string | null;
  reason: PolicyDenyReason | null;
}

export function checkPathPermitted(
  scope: {
    allowedPaths: readonly string[];
    deniedPaths: readonly string[];
  },
  rawPath: string,
): PathCheckResult {
  const normalizedPath = normalizeScopedPath(rawPath);
  if (normalizedPath === null) {
    return {
      permitted: false,
      normalizedPath: null,
      reason: denyReason("path_not_permitted", "request path is not a canonical absolute path"),
    };
  }

  for (const entry of scope.deniedPaths) {
    const normalizedEntry = normalizeScopeEntry(entry);
    const matches =
      normalizedEntry === null
        ? true // malformed deny rule → fail closed
        : normalizedEntry === "/" ||
          normalizedPath === normalizedEntry ||
          normalizedPath.startsWith(`${normalizedEntry}/`);
    if (matches) {
      return {
        permitted: false,
        normalizedPath,
        reason: denyReason(
          "path_explicitly_denied",
          `path is under denied scope prefix ${JSON.stringify(entry)}`,
        ),
      };
    }
  }

  for (const entry of scope.allowedPaths) {
    const normalizedEntry = normalizeScopeEntry(entry);
    if (
      normalizedEntry !== null &&
      (normalizedEntry === "/" ||
        normalizedPath === normalizedEntry ||
        normalizedPath.startsWith(`${normalizedEntry}/`))
    ) {
      return { permitted: true, normalizedPath, reason: null };
    }
  }

  return {
    permitted: false,
    normalizedPath,
    reason: denyReason("path_not_permitted", "path is outside every allowed scope prefix"),
  };
}
