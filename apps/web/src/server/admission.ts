import type { ScanAdmission, ScanAdmissionLimits } from "@highcastle/db";
import type { Session } from "./session";

/**
 * Server-side scan admission policy (issue #83).
 *
 * The DB enforces these limits atomically inside the scan-creation
 * transaction (see `createScan` / `scan_admissions` ledger). This module
 * only decides WHICH subject and ceilings apply to a session — every value
 * is derived server-side from the verified session, never from request
 * headers, so guests cannot mint extra budget by spoofing identity.
 *
 * Defaults are sized for the single 2 GB Vultr VM: each active scan is one
 * disposable runner (~256 MB cap), so the workspace-wide ceiling of 8 keeps
 * the control plane, Postgres and the lab inside memory. Env overrides are
 * operator knobs, not client input.
 */

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function scanAdmissionLimitsFromEnv(): ScanAdmissionLimits {
  return {
    maxActivePerProject: envInt("SCAN_MAX_ACTIVE_PER_PROJECT", 5),
    maxActivePerWorkspace: envInt("SCAN_MAX_ACTIVE_PER_WORKSPACE", 8),
    maxActivePerTarget: envInt("SCAN_MAX_ACTIVE_PER_TARGET", 5),
  };
}

/**
 * Admission policy for one request. Demo guests get tight per-session
 * windows keyed on the signed session id — new scans per hour AND per day
 * are both bounded, and an exhausted guest cannot extend budget by minting
 * another session because the global workspace ceiling still applies.
 * Account sessions get a wider per-user window; the shared ceilings are
 * identical for everyone.
 */
export function scanAdmissionFor(session: Session): ScanAdmission {
  const limits = scanAdmissionLimitsFromEnv();
  if (session.kind === "demo") {
    return {
      limits,
      subject: {
        key: `demo:${session.sessionId}`,
        windows: [
          {
            maxPerWindow: envInt("SCAN_GUEST_MAX_PER_HOUR", 6),
            windowSeconds: 3600,
          },
          {
            maxPerWindow: envInt("SCAN_GUEST_MAX_PER_DAY", 10),
            windowSeconds: 86_400,
          },
        ],
      },
    };
  }
  return {
    limits,
    subject: {
      key: `account:${session.userId}`,
      windows: [
        {
          maxPerWindow: envInt("SCAN_USER_MAX_PER_HOUR", 60),
          windowSeconds: 3600,
        },
      ],
    },
  };
}
