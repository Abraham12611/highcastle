"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AssessmentContext, AssessmentTargetOption } from "./api";
import { createScan, getAssessmentContext } from "./api";
import "./scans.css";

export type WizardProps = {
  projectId: string;
  /** Injected context for the mocked story path; live route omits it. */
  contextOverride?: AssessmentContext;
  /** Injected create function for tests/story; defaults to real API. */
  createScanFn?: typeof createScan;
};

export function ScanWizard({ projectId, contextOverride, createScanFn }: WizardProps) {
  const router = useRouter();
  const create = createScanFn ?? createScan;
  const [ctx, setCtx] = useState<AssessmentContext | null>(contextOverride ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (contextOverride !== undefined) return;
    void getAssessmentContext(projectId).then((r) => {
      if (r.ok) setCtx(r.data);
      else setLoadError(`${r.error.message} (${r.error.code})`);
    });
  }, [projectId, contextOverride]);

  const option: AssessmentTargetOption | null =
    ctx?.targets.find((t) => t.target.id === targetId) ?? null;
  const canSubmit = option !== null && option.scope !== null && consent && !submitting;

  const submit = async () => {
    if (option === null || option.scope === null) return;
    setSubmitting(true);
    setSubmitError(null);
    const res = await create(projectId, {
      type: "targeted_red_team",
      environmentId: option.environment.id as never,
      targetId: option.target.id as never,
      authorizationScopeId: option.scope.id as never,
      testPackIds: ["bola-invoice-v1"],
    }, crypto.randomUUID());
    setSubmitting(false);
    if (!res.ok) {
      setSubmitError(`${res.error.message} (${res.error.code})`);
      return;
    }
    router.push(`/app/scans/${res.data.scanId}`);
  };

  return (
    <main className="scan-wizard">
      <h1>New assessment</h1>
      <p className="muted">
        HighCastle runs bounded, authorized checks against owned synthetic
        targets only. You cannot choose arbitrary hosts, tools or credentials.
      </p>

      {loadError && (
        <div className="hc-callout hc-callout--danger" role="alert">
          Could not load authorized targets: {loadError}
        </div>
      )}

      <section aria-label="Authorized target">
        <h2>1. Authorized target</h2>
        {ctx === null && !loadError && <p className="muted">Loading…</p>}
        {ctx?.targets.map((t) => (
          <label key={t.target.id} className={`target-card ${targetId === t.target.id ? "is-selected" : ""}`}>
            <input
              type="radio"
              name="target"
              checked={targetId === t.target.id}
              onChange={() => setTargetId(t.target.id)}
            />
            <span className="target-card__name">{t.target.label}</span>
            <span className="target-card__meta">
              {t.target.canonicalOrigin} · {t.target.targetKind} · {t.target.state}
            </span>
            <span className="target-card__meta">
              env: {t.environment.label} ({t.environment.currentRevision})
            </span>
          </label>
        ))}
        {ctx !== null && ctx.targets.length === 0 && (
          <p className="muted">No verified targets available for this project.</p>
        )}
      </section>

      {option?.scope && (
        <section aria-label="Scope details">
          <h2>2. Authorization scope</h2>
          <dl className="scope-detail">
            <dt>Test pack</dt><dd>bola-invoice-v1 (read-only BOLA check)</dd>
            <dt>Methods</dt><dd>{option.scope.allowedMethods.join(", ")}</dd>
            <dt>Paths</dt><dd>{option.scope.allowedPaths.join(", ")}</dd>
            <dt>Limits</dt><dd>{option.scope.maxRequests} req · {option.scope.maxDurationSeconds}s</dd>
            <dt>Expires</dt><dd>{option.scope.expiresAt}</dd>
          </dl>
          {option.scope === null && (
            <p className="muted">No active authorization scope for this target.</p>
          )}
        </section>
      )}

      {option?.scope && (
        <section aria-label="Consent">
          <h2>3. Consent</h2>
          <label className="consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            I authorize this bounded test against the owned synthetic lab
            within the scope shown. I understand the run records evidence and
            a model cannot expand these limits.
          </label>
        </section>
      )}

      {submitError && (
        <div className="hc-callout hc-callout--danger" role="alert">
          Scan rejected: {submitError}
        </div>
      )}

      <div className="scan-actions">
        <button
          type="button"
          className="hc-btn hc-btn--primary"
          disabled={!canSubmit}
          onClick={() => void submit()}
        >
          {submitting ? "Requesting scan…" : "Start authorized scan"}
        </button>
      </div>
    </main>
  );
}
