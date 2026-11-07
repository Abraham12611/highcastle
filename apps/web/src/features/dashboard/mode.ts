/**
 * Builder / Developer experience mode.
 *
 * Mode is a PRESENTATION choice only: it changes labels, default tab
 * density and which panels are emphasized — never authorization, never
 * data. Switching mode preserves the route, filters and entity IDs
 * (navigation state contract, 08_NAVIGATION_STATES_AND_ACCESS.md).
 */

export const MODE_COOKIE = "hc-mode";

export type ExperienceMode = "builder" | "developer";

export function resolveMode(value: string | null | undefined): ExperienceMode {
  return value === "developer" ? "developer" : "builder";
}

export const MODE_LABEL: Record<ExperienceMode, string> = {
  builder: "Builder",
  developer: "Developer",
};

export const MODE_DESCRIPTION: Record<ExperienceMode, string> = {
  builder: "Plain-language summaries and guided next steps.",
  developer: "Full evidence, revisions, hashes and policy detail.",
};

/** Builder aliases change labels only (IA contract) — same hrefs. */
export function modeNavLabel(mode: ExperienceMode, label: string): string {
  if (mode !== "builder") return label;
  if (label === "Findings") return "Issues found";
  if (label === "Fixes & Replays") return "Fixes & re-checks";
  if (label === "Automation") return "Checks & schedules";
  return label;
}

/** Sections hidden in Builder mode (Developer-only depth). */
export function isDeveloperOnlySection(key: string): boolean {
  return key === "developers" || key === "automation";
}
