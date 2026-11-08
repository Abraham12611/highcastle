"use client";

import { useCallback, useState } from "react";
import styles from "./onboarding.module.css";

/**
 * Builder onboarding — enter a URL, prove site control, grant explicit
 * path consent, then run a strictly passive recon. Everything shown comes
 * from API rows; nothing here fabricates observations.
 */

type Verification = {
  status: string;
  expiresAt: string;
  dnsRecordName: string;
  dnsTxtValue: string;
  wellKnownUrl: string;
  wellKnownExpectedBody: string;
};

type Observation = {
  kind: string;
  name: string;
  observed: boolean;
  detail: string | null;
  severity: string;
};

type ReconRun = {
  runId: string;
  status: string;
  requestCount: number;
  bytesReceived: number;
  observations: Observation[];
  limitations: string[];
  errorCode: string | null;
};

type Step = "enter" | "verify" | "consent" | "recon";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-highcastle-request": "1",
      ...(init?.headers ?? {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error?.message ?? `request failed (${res.status})`);
  }
  return json.data as T;
}

export function BuilderOnboarding({ workspaceId }: { workspaceId: string }) {
  const [step, setStep] = useState<Step>("enter");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [verifyResult, setVerifyResult] = useState<{
    status: string;
    reason: string | null;
  } | null>(null);

  const [pathsText, setPathsText] = useState("/\n");
  const [consent, setConsent] = useState(false);
  const [run, setRun] = useState<ReconRun | null>(null);

  const base = `/api/v1/workspaces/${workspaceId}/builder`;

  const runStep = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "request failed");
    } finally {
      setBusy(false);
    }
  }, []);

  const createProject = () =>
    runStep(async () => {
      const data = await api<{
        targetId: string;
        verification: Verification;
      }>(`${base}/projects`, {
        method: "POST",
        body: JSON.stringify({ name, siteUrl }),
      });
      setTargetId(data.targetId);
      setVerification(data.verification);
      setStep("verify");
    });

  const verify = (method: "dns-txt" | "well-known") =>
    runStep(async () => {
      const data = await api<{ status: string; reason: string | null }>(
        `${base}/targets/${targetId}/verify`,
        { method: "POST", body: JSON.stringify({ method }) },
      );
      setVerifyResult(data);
      if (data.status === "verified") setStep("consent");
    });

  const grantConsent = () =>
    runStep(async () => {
      const allowedPaths = pathsText
        .split("\n")
        .map((p) => p.trim())
        .filter(Boolean);
      await api(`${base}/targets/${targetId}/permissions`, {
        method: "POST",
        body: JSON.stringify({
          allowedPaths,
          consentAccepted: true,
          consentVersion: "site-recon-consent-v1",
        }),
      });
      setStep("recon");
    });

  const runRecon = () =>
    runStep(async () => {
      const data = await api<ReconRun>(`${base}/targets/${targetId}/recon`, {
        method: "POST",
      });
      setRun(data);
    });

  return (
    <div className={styles.wrap}>
      <ol className={styles.steps}>
        {(["enter", "verify", "consent", "recon"] as Step[]).map((s, i) => (
          <li key={s} className={step === s ? styles.active : ""}>
            {i + 1}.{" "}
            {s === "enter"
              ? "Site"
              : s === "verify"
                ? "Verify control"
                : s === "consent"
                  ? "Consent"
                  : "Passive recon"}
          </li>
        ))}
      </ol>

      {error ? <p className={styles.error}>{error}</p> : null}

      {step === "enter" && (
        <section className={styles.card}>
          <h2>Add your site</h2>
          <p className={styles.muted}>
            We only check a site after you prove control of it. A URL never gives us access to your
            code.
          </p>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My app" />
          </label>
          <label>
            Site URL
            <input
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              placeholder="https://app.example.com"
            />
          </label>
          <button disabled={busy || !name.trim() || !siteUrl.trim()} onClick={createProject}>
            {busy ? "Creating…" : "Create draft project"}
          </button>
        </section>
      )}

      {step === "verify" && verification && (
        <section className={styles.card}>
          <h2>Prove site control</h2>
          <p className={styles.muted}>
            Choose one method. The challenge expires at {verification.expiresAt}.
          </p>
          <h3>Option A — DNS TXT record</h3>
          <p className={styles.mono}>
            {verification.dnsRecordName} TXT {verification.dnsTxtValue}
          </p>
          <h3>Option B — file on the site</h3>
          <p className={styles.mono}>{verification.wellKnownUrl}</p>
          <p className={styles.muted}>
            content: <code>{verification.wellKnownExpectedBody}</code>
          </p>
          <div className={styles.row}>
            <button disabled={busy} onClick={() => verify("dns-txt")}>
              Check DNS record
            </button>
            <button disabled={busy} onClick={() => verify("well-known")}>
              Check file
            </button>
          </div>
          {verifyResult && verifyResult.status !== "verified" && (
            <p className={styles.error}>{verifyResult.reason ?? verifyResult.status}</p>
          )}
        </section>
      )}

      {step === "consent" && (
        <section className={styles.card}>
          <h2>Permitted public paths</h2>
          <p className={styles.muted}>
            We fetch only these paths — one per line. Nothing else is touched.
          </p>
          <textarea
            rows={5}
            value={pathsText}
            onChange={(e) => setPathsText(e.target.value)}
            className={styles.mono}
          />
          <label className={styles.row}>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              I control this site (or am authorized to approve testing) and permit HighCastle to
              fetch only the listed paths with strict limits — no authentication attempts, no
              intrusive testing.
            </span>
          </label>
          <button disabled={busy || !consent} onClick={grantConsent}>
            {busy ? "Saving…" : "Grant permission"}
          </button>
        </section>
      )}

      {step === "recon" && (
        <section className={styles.card}>
          <h2>Passive recon</h2>
          <p className={styles.muted}>
            Reads HTTP status, security headers, cookie flags and TLS facts only — no forms, no
            logins, no intrusive tests.
          </p>
          <button disabled={busy} onClick={runRecon}>
            {busy ? "Running…" : "Run passive recon"}
          </button>
          {run && (
            <div className={styles.results}>
              <p>
                <strong>{run.status}</strong> — {run.requestCount} requests, {run.bytesReceived}{" "}
                bytes
                {run.errorCode ? ` · ${run.errorCode}` : ""}
              </p>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Check</th>
                    <th>Observed</th>
                    <th>Detail</th>
                    <th>Severity</th>
                  </tr>
                </thead>
                <tbody>
                  {run.observations.map((o, i) => (
                    <tr key={i}>
                      <td className={styles.mono}>{o.name}</td>
                      <td>{o.observed ? "yes" : "no"}</td>
                      <td>{o.detail ?? "—"}</td>
                      <td>{o.severity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <h3>What this does NOT prove</h3>
              <ul className={styles.muted}>
                {run.limitations.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
