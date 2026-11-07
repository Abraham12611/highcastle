import { CodeBlock, EvidenceCard } from "@highcastle/ui";
import type { ProofLeg } from "../types";
import styles from "./findings.module.css";

function identityLine(leg: ProofLeg): string {
  if (leg.identity === null) return "No invoice data returned.";
  return `Invoice ${leg.identity.id} owned by ${leg.identity.ownerId} (${leg.identity.tenantId}).`;
}

function LegEvidence({
  title,
  kind,
  leg,
}: {
  title: string;
  kind: "redacted_request" | "redacted_response";
  leg: ProofLeg;
}) {
  return (
    <EvidenceCard
      kind={kind}
      title={title}
      hash={leg.bodyHash}
      attemptRef={`${leg.method} ${leg.path}`}
      redacted
    >
      <dl className={styles.facts}>
        <div>
          <dt>Observed response</dt>
          <dd>
            HTTP {leg.status} · {identityLine(leg)}
          </dd>
        </div>
        <div>
          <dt>SHA-256 over sanitized bytes</dt>
          <dd className={styles.mono}>{leg.bodyHash}</dd>
        </div>
      </dl>
      <CodeBlock code={leg.excerptRedacted} language="json" title="Redacted excerpt" />
    </EvidenceCard>
  );
}

/**
 * Proof tab: the actual Alice→Alice baseline and Alice→Bob cross-account
 * observations, plus pack and target provenance. Evidence is redacted;
 * integrity digests are shown for verification.
 */
export function ProofPanel({
  baseline,
  crossAccount,
  packId,
  packVersion,
  oracleVersion,
  targetRevision,
  fixtureVersion,
  verdictReasons,
}: {
  baseline: ProofLeg;
  crossAccount: ProofLeg;
  packId: string;
  packVersion: string;
  oracleVersion: string;
  targetRevision: string;
  fixtureVersion: string;
  verdictReasons: string[];
}) {
  return (
    <section aria-label="Execution proof" className={styles.evidence}>
      <LegEvidence
        title="P1 · Baseline: Alice reads her own invoice"
        kind="redacted_request"
        leg={baseline}
      />
      <LegEvidence
        title="S1 · Cross-account: Alice requests Bob's invoice"
        kind="redacted_response"
        leg={crossAccount}
      />
      <EvidenceCard kind="oracle" title="Independent oracle verdict">
        <ul>
          {verdictReasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
        <p>
          Pack {packId} v{packVersion} · oracle {oracleVersion} · target {targetRevision} · fixture{" "}
          {fixtureVersion}.
        </p>
      </EvidenceCard>
    </section>
  );
}
