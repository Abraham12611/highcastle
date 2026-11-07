import Link from "next/link";
import { StatusPill } from "@highcastle/ui";
import { appPaths } from "../dashboard/nav";
import styles from "../dashboard/panels.module.css";

/**
 * Project header for the project overview (L08 owns project features).
 * Lifecycle + verification state only — no scores, no fabricated data.
 */

const LIFECYCLE_TONE = {
  draft: "slate",
  ready: "mint",
  needs_attention: "amber",
  paused: "slate",
  archived: "slate",
} as const;

export function ProjectHeader({
  workspaceSlug,
  project,
  verification,
}: {
  workspaceSlug: string;
  project: { id: string; slug: string; name: string; lifecycle: string };
  verification: { label: string; verified: boolean };
}) {
  return (
    <div className={styles.headerRow}>
      <div>
        <h1 className={styles.pageTitle}>{project.name}</h1>
        <p className={styles.pageSub}>
          <StatusPill
            tone={LIFECYCLE_TONE[project.lifecycle as keyof typeof LIFECYCLE_TONE] ?? "slate"}
            size="sm"
            label={project.lifecycle.replaceAll("_", " ")}
          />{" "}
          <StatusPill
            tone={verification.verified ? "mint" : "amber"}
            size="sm"
            label={verification.label}
          />
        </p>
      </div>
      <div className={styles.headerActions}>
        <Link className={styles.cta} href={appPaths.newScan(workspaceSlug, project.id)}>
          New assessment
        </Link>
        <Link
          className={styles.secondaryCta}
          href={appPaths.scopePolicy(workspaceSlug, project.id)}
        >
          Scope & policy
        </Link>
      </div>
    </div>
  );
}
