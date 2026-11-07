import { Panel, PanelBody, PanelHeader } from "@highcastle/ui";
import type { AttemptRecord } from "../types";
import styles from "./findings.module.css";

/**
 * Attack-path tab: entry point → trust boundary → missing check →
 * observed data. Static explanation anchored to the recorded attempt,
 * not a re-execution.
 */
export function AttackPathPanel({ attempt }: { attempt: AttemptRecord }) {
  const cross = attempt.crossAccount.identity;
  return (
    <section aria-label="Attack path" className="hc-attack-path">
      <Panel>
        <PanelHeader>
          <h3>How the check reached another tenant&apos;s data</h3>
        </PanelHeader>
        <PanelBody>
          <ol className={styles.steps}>
            <li>
              <strong>Entry point.</strong> Authenticated session for Alice (user_A, tenant_A) calls{" "}
              <code className="hc-mono">GET /api/invoices/invoice_B</code> — a known fixture ID, not
              an enumerated one.
            </li>
            <li>
              <strong>Trust boundary crossed.</strong> The invoice lookup resolved the object by ID
              alone, applying no tenant or ownership predicate for the authenticated actor.
            </li>
            <li>
              <strong>Observed data.</strong>{" "}
              {cross === null
                ? "No invoice data was returned for the cross-account read."
                : `HTTP ${attempt.crossAccount.status} returned invoice ${cross.id} owned by ${cross.ownerId} (${cross.tenantId}).`}
            </li>
            <li>
              <strong>Control.</strong> The same session reading{" "}
              <code className="hc-mono">/api/invoices/invoice_A</code> returned HTTP{" "}
              {attempt.baseline.status} — the baseline the oracle requires before any cross-account
              claim.
            </li>
          </ol>
          <p className={styles.fingerprint}>
            Attempt {attempt.attemptId} · target {attempt.targetRevision} · fixture{" "}
            {attempt.fixtureVersion}
          </p>
        </PanelBody>
      </Panel>
    </section>
  );
}
