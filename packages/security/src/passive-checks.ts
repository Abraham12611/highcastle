import type { PassiveObservation } from "@highcastle/contracts";
import type { FetchedPage, TlsSession } from "./recon-fetcher.js";

/**
 * Pure analysis: fetched pages → honest passive observations.
 *
 * Output is observational only — every entry says what was ACTUALLY SEEN,
 * never "vulnerable"/"safe" verdicts. `limitations` (appended by the caller
 * into the run) always re-state what passive checks cannot establish.
 */

const SECURITY_HEADERS: Array<{
  name: string;
  note: string;
  severityMissing: PassiveObservation["severity"];
}> = [
  { name: "strict-transport-security", note: "HSTS", severityMissing: "medium" },
  { name: "content-security-policy", note: "CSP", severityMissing: "medium" },
  {
    name: "x-frame-options",
    note: "clickjacking protection (or CSP frame-ancestors)",
    severityMissing: "low",
  },
  { name: "x-content-type-options", note: "MIME sniffing protection", severityMissing: "low" },
  { name: "referrer-policy", note: "referrer leakage control", severityMissing: "low" },
  { name: "permissions-policy", note: "browser feature policy", severityMissing: "informational" },
];

export function analyzePassivePages(
  canonicalOrigin: string,
  pages: FetchedPage[],
): PassiveObservation[] {
  const out: PassiveObservation[] = [];
  const root = pages.find((p) => p.path === "/") ?? pages[0];

  if (root) {
    // --- TLS facts (from the pinned connection that fetched "/") ---
    out.push(...analyzeTls(root.tls));

    // --- Security headers on the landing page ---
    for (const h of SECURITY_HEADERS) {
      const present = Object.keys(root.headers).some((k) => k.toLowerCase() === h.name);
      if (h.name === "x-frame-options" && !present) {
        // frame-ancestors in CSP is the modern equivalent — check before flagging.
        const csp = headerValue(root.headers, "content-security-policy") ?? "";
        if (csp.toLowerCase().includes("frame-ancestors")) {
          out.push(
            obs(
              "security_headers",
              "x-frame-options",
              true,
              "covered by CSP frame-ancestors",
              "informational",
            ),
          );
          continue;
        }
      }
      const value = headerValue(root.headers, h.name);
      out.push(
        present
          ? obs("security_headers", h.name, true, value ?? "present", "informational")
          : obs(
              "security_headers",
              h.name,
              false,
              `missing — ${h.note} not declared`,
              h.severityMissing,
            ),
      );
    }

    // --- Cookies (flags only — never record cookie values) ---
    const cookies = headerValues(root.headers, "set-cookie");
    for (const raw of cookies) {
      const name = raw.split("=", 1)[0]?.trim() || "cookie";
      const low = raw.toLowerCase();
      const flags: string[] = [];
      if (!low.includes("secure")) flags.push("missing Secure");
      if (!low.includes("httponly")) flags.push("missing HttpOnly");
      if (!low.includes("samesite")) flags.push("missing SameSite");
      out.push(
        obs(
          "cookie",
          `set-cookie: ${name}`,
          flags.length === 0,
          flags.length === 0 ? "Secure+HttpOnly+SameSite present" : flags.join(", "),
          flags.length === 0 ? "informational" : "medium",
        ),
      );
    }

    // --- Server disclosure ---
    const server = headerValue(root.headers, "server");
    if (server) {
      out.push(
        obs(
          "metadata",
          "server header",
          true,
          `discloses: ${server.slice(0, 80)}`,
          "informational",
        ),
      );
    }
    const poweredBy = headerValue(root.headers, "x-powered-by");
    if (poweredBy) {
      out.push(
        obs("metadata", "x-powered-by", true, `discloses: ${poweredBy.slice(0, 80)}`, "low"),
      );
    }

    if (root.redirectLocation) {
      out.push(
        obs(
          "redirect",
          "GET /",
          true,
          `redirect to ${safeLocation(root.redirectLocation, canonicalOrigin)} not followed unless same-host`,
          "informational",
        ),
      );
    }
  }

  // --- Status per probed path ---
  for (const p of pages) {
    out.push(obs("http_status", `GET ${p.path}`, true, `HTTP ${p.status}`, "informational"));
  }

  return out;
}

/** Standard honesty statements — passive recon can never establish these. */
export function standardLimitations(pathsProbed: number): string[] {
  return [
    "Passive metadata checks only — no forms submitted, no authentication attempted, no state-changing requests made.",
    `Only ${pathsProbed} permitted path(s) were fetched; the rest of the site was not examined.`,
    "A verified URL does not provide source code — no code-level review or fix confirmation is possible from these checks.",
    "Absent a header is an observation, not proof of a vulnerability; the platform may set policies elsewhere.",
    "Ownership proof does not authorize intrusive testing on shared hosting platforms — no such tests were run.",
  ];
}

function analyzeTls(tls: TlsSession): PassiveObservation[] {
  const out: PassiveObservation[] = [];
  const proto = tls.protocol;
  const protoOk = proto === "TLSv1.2" || proto === "TLSv1.3";
  out.push(
    obs(
      "tls",
      "protocol",
      protoOk,
      proto ? `${proto}${protoOk ? "" : " — below recommended TLS 1.2 minimum"}` : "unknown",
      protoOk ? "informational" : "high",
    ),
  );
  out.push(
    obs(
      "tls",
      "certificate_chain",
      tls.authorized,
      tls.authorized
        ? `CA-validated (issuer: ${(tls.certIssuer ?? "unknown").slice(0, 120)})`
        : "certificate did not validate against public CAs",
      tls.authorized ? "informational" : "medium",
    ),
  );
  if (tls.certNotAfter) {
    const days = Math.floor((new Date(tls.certNotAfter).getTime() - Date.now()) / 86400000);
    out.push(
      obs(
        "tls",
        "certificate_validity",
        days > 14,
        `${days} days until expiry`,
        days <= 0 ? "high" : days <= 14 ? "medium" : "informational",
      ),
    );
  }
  return out;
}

function obs(
  kind: PassiveObservation["kind"],
  name: string,
  observed: boolean,
  detail: string | null,
  severity: PassiveObservation["severity"],
): PassiveObservation {
  return { kind, name, observed, detail, severity };
}

function headerValue(headers: Record<string, string[]>, name: string): string | null {
  const v = headerValues(headers, name);
  return v.length > 0 ? v.join("; ").slice(0, 500) : null;
}

function headerValues(headers: Record<string, string[]>, name: string): string[] {
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === name) return v;
  }
  return [];
}

function safeLocation(loc: string, origin: string): string {
  try {
    const u = new URL(loc, origin);
    return u.host === new URL(origin).host ? u.pathname.slice(0, 200) : `cross-host (${u.host})`;
  } catch {
    return "(unparseable location header)";
  }
}
