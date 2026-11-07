import { ReplayDiff, VerdictBadge, type AssertionRow } from "@highcastle/ui";
import type { ReplayVerdict } from "@highcastle/contracts";
import { verdictExplainer, type BeforeAfterComparison } from "../../findings/view-model";
import styles from "../../findings/components/findings.module.css";

/**
 * Before/after replay comparison (L10).
 *
 * Presentational only: rows come from recorded attempts or server-stated
 * replay assertions, and the verdict banner reflects the SERVER replay
 * verdict passed in — this component cannot assign `verified_fixed`.
 */
export function ReplayComparison({
  comparison,
  verdict,
  provenance,
}: {
  comparison: BeforeAfterComparison;
  verdict: ReplayVerdict;
  provenance: string[];
}) {
  const toRows = (rows: BeforeAfterComparison["before"]["rows"]): AssertionRow[] =>
    rows.map((row) => ({
      key: row.key,
      label: row.label,
      result: row.result,
      observed: row.observed,
    }));
  return (
    <section aria-label="Before and after comparison" className="hc-replay-comparison">
      <ReplayDiff
        before={{
          label: comparison.before.label,
          environment: comparison.before.environment,
          assertions: toRows(comparison.before.rows),
          summary: comparison.before.summary,
        }}
        after={{
          label: comparison.after.label,
          environment: comparison.after.environment,
          assertions: toRows(comparison.after.rows),
          summary: comparison.after.summary,
        }}
        verdict={
          <p className="hc-replay-verdict">
            <VerdictBadge verdict={verdict} /> {verdictExplainer(verdict)}
          </p>
        }
      />
      <ul className={styles.replayProvenance}>
        {provenance.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
