import { CodeBlock, EvidenceCard } from "@highcastle/ui";
import styles from "./findings.module.css";
import type { ProofLeg, StoredAttempt } from "../types";

function identityLine(leg: ProofLeg): string {
  if (leg.identity === null) return "No invoice data returned.";
  return `Invoice ${leg.identity.id} owned by ${leg.identity.ownerId} (${leg.identity.tenantId}).`;
}

function LegEvidence({ title, kind, leg }: { title: string; kind: "redacted_request" | "redacted_response"; leg: ProofLeg }) {
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

function StoredAttemptCard({ attempt }: { attempt: StoredAttempt }) {
  return (
    <EvidenceCard
      kind="oracle"
      title={`Stored attempt ${attempt.attemptId}`}
      hash={attempt.evidence[0]?.sha256 ?? "no-evidence-recorded"}
      attemptRef={`${attempt.packId} v${attempt.packVersion} · ${attempt.targetRevision}`}
      redacted
    >
      <dl className={styles.facts}>
        <div>
          <dt>Oracle verdict</dt>
          <dd>{attempt.verifierVerdict ?? "pending"}</dd>
        </div>
        <div>
          <dt>Legitimate read (positive control)</dt>
          <dd>
            {attempt.positiveControlPassed === true ? "passed"
            : attempt.positiveControlPassed === false ? "failed"
            : "unavailable"}
          </dd>
        </div>
        <div>
          <dt>Cross-account denied (negative control)</dt>
          <dd>
            {attempt.negativeSecurityConditionMet === true ? "denied"
            : attempt.negativeSecurityConditionMet === false ? "returned data"
            : "unavailable"}
          </dd>
        </div>
        <div>
          <dt>Observed</dt>
          <dd>{attempt.observedAt ?? "unknown time"}</dd>
        </div>
      </dl>
      {attempt.evidence.length === 0 ?
        <p>No evidence artifacts were recorded for this attempt.</p>
      : <ul>
          {attempt.evidence.map((item) => (
            <li key={item.id}>
              {item.artifactKind} · SHA-256 {item.sha256} · {item.byteSize} bytes ·{" "}
              {item.contentType}
            </li>
          ))}
        </ul>
      }
      <p>
        Artifact bytes stay server-side until object storage lands (L19);
        digests above identify the redacted records.
      </p>
    </EvidenceCard>
  );
}

/**
 * Proof tab: recorded P1/S1 evidence when present (demo), and always the
 * stored execution record from the BFF — attempt metadata, control
 * outcomes, oracle verdict and redacted evidence digests. Body bytes are
 * never rendered because the API never serves them.
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
  stored,
}: {
  baseline: ProofLeg | null;
  crossAccount: ProofLeg | null;
  packId: string;
  packVersion: string;
  oracleVersion: string;
  targetRevision: string;
  fixtureVersion: string;
  verdictReasons: string[];
  stored: StoredAttempt[];
}) {
  return (
    <section aria-label="Execution proof" className={styles.evidence}>
      {baseline !== null && crossAccount !== null ?
        <>
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
              Pack {packId} v{packVersion} · oracle {oracleVersion} · target{" "}
              {targetRevision} · fixture {fixtureVersion}.
            </p>
          </EvidenceCard>
        </>
      : null}
      {stored.map((attempt) => (
        <StoredAttemptCard key={attempt.attemptId} attempt={attempt} />
      ))}
    </section>
  );
}
