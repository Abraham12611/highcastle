import {
  Callout,
  CodeBlock,
  CopyButton,
  InconclusiveState,
  Panel,
  PanelBody,
  PanelHeader,
} from "@highcastle/ui";
import type { AttemptRecord, ExperienceMode, FixGuidance } from "../types";
import styles from "./findings.module.css";
import { buildFixInstructions, invariantCopy } from "../view-model";

/**
 * Fix tab: the broken invariant in plain or developer language, the
 * copyable agent prompt, and the safer patch guidance. Nothing here
 * edits source — the H flow copies instructions out. Missing guidance
 * renders as missing evidence, never as invented text.
 */
export function FixPanel({
  title,
  fingerprint,
  attempt,
  guidance,
  mode,
}: {
  title: string;
  fingerprint: string;
  attempt: AttemptRecord | null;
  guidance: FixGuidance | null;
  mode: ExperienceMode;
}) {
  const invariant = invariantCopy(mode);
  if (attempt === null || guidance === null) {
    return (
      <InconclusiveState title="Fix guidance unavailable">
        The findings API has not served redacted fix guidance for this finding yet. No instructions
        are shown rather than invented ones.
      </InconclusiveState>
    );
  }
  const instructions = buildFixInstructions({ title, fingerprint, attempt, guidance });
  return (
    <section aria-label="Fix guidance" className="hc-fix">
      <Callout tone="info" title={invariant.title}>
        <p>{invariant.body}</p>
      </Callout>
      <Panel>
        <PanelHeader>
          <h3>Agent fix prompt</h3>
        </PanelHeader>
        <PanelBody>
          <CodeBlock
            code={instructions.body}
            language="text"
            title={instructions.title}
            lineNumbers
          />
          <p className={styles.fixActions}>
            <CopyButton value={instructions.body} label="Copy fix instructions" />
          </p>
          <p className={styles.fixProvenance}>
            Guidance built from the recorded attempt —{" "}
            {guidance.provenance === "api"
              ? "served by the findings API."
              : "assembled locally from recorded evidence (API fix-prompt unavailable)."}
          </p>
        </PanelBody>
      </Panel>
    </section>
  );
}
