"use client";

import { useMemo, useState } from "react";
import { Field, Select, TextInput } from "@highcastle/ui";
import type { Confidence, RemediationStatus, Severity } from "@highcastle/contracts";
import type { FindingSummary } from "../types";
import { FindingCard } from "./FindingCard";
import styles from "./findings.module.css";

const ALL = "all";

function matches(value: string, query: string): boolean {
  return value.toLowerCase().includes(query.toLowerCase());
}

/**
 * Client-side search and axis filters over server-loaded findings.
 * Filtering never changes evidence — it only narrows the visible rows.
 */
export function FindingList({
  workspaceSlug,
  projectId,
  findings,
}: {
  workspaceSlug: string;
  projectId: string;
  findings: FindingSummary[];
}) {
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState<string>(ALL);
  const [confidence, setConfidence] = useState<string>(ALL);
  const [remediation, setRemediation] = useState<string>(ALL);

  const visible = useMemo(
    () =>
      findings.filter(
        (finding) =>
          (query === "" || matches(finding.title, query)) &&
          (severity === ALL || finding.severity === (severity as Severity)) &&
          (confidence === ALL || finding.confidence === (confidence as Confidence)) &&
          (remediation === ALL || finding.remediationStatus === (remediation as RemediationStatus)),
      ),
    [findings, query, severity, confidence, remediation],
  );

  return (
    <section aria-label="Findings">
      <div className={styles.filters}>
        <Field label="Search findings">
          <TextInput
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by title"
            aria-label="Search findings"
          />
        </Field>
        <Field label="Severity">
          <Select
            value={severity}
            onChange={(event) => setSeverity(event.target.value)}
            aria-label="Filter by severity"
          >
            <option value={ALL}>All severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="informational">Informational</option>
          </Select>
        </Field>
        <Field label="Confidence">
          <Select
            value={confidence}
            onChange={(event) => setConfidence(event.target.value)}
            aria-label="Filter by confidence"
          >
            <option value={ALL}>Any confidence</option>
            <option value="confirmed_by_execution">Confirmed by execution</option>
            <option value="supported_by_analysis">Supported by analysis</option>
            <option value="suspected">Suspected</option>
            <option value="not_reproduced">Not reproduced</option>
            <option value="inconclusive">Inconclusive</option>
          </Select>
        </Field>
        <Field label="Remediation">
          <Select
            value={remediation}
            onChange={(event) => setRemediation(event.target.value)}
            aria-label="Filter by remediation status"
          >
            <option value={ALL}>Any status</option>
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="pending_verification">Pending verification</option>
            <option value="verified_fixed">Verified fixed</option>
            <option value="accepted_risk">Accepted risk</option>
            <option value="dismissed">Dismissed</option>
            <option value="reopened">Reopened</option>
          </Select>
        </Field>
      </div>
      {visible.length === 0 ? (
        <p role="status">No findings match the current filters.</p>
      ) : (
        <ul className={styles.list}>
          {visible.map((finding) => (
            <li key={finding.id}>
              <FindingCard workspaceSlug={workspaceSlug} projectId={projectId} finding={finding} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
