import type { NavSectionData } from "@highcastle/ui";
import { isDeveloperOnlySection, modeNavLabel, type ExperienceMode } from "./mode";

/**
 * Route builders + shared nav model for `/app`.
 *
 * This module is the shell contract L09 (scans) and L10 (findings) build
 * against: their pages live under the workspace layout, reuse
 * `getWorkspaceSections` / `getProjectSections` for the rail, and link back
 * with `appPaths`. Scan/finding pages themselves are NOT in this lane.
 */

export function workspacePath(workspaceSlug: string): string {
  return `/app/w/${workspaceSlug}`;
}

export const appPaths = {
  overview: (workspaceSlug: string) => `${workspacePath(workspaceSlug)}/overview`,
  projects: (workspaceSlug: string) => `${workspacePath(workspaceSlug)}/projects`,
  projectOverview: (workspaceSlug: string, projectId: string) =>
    `${workspacePath(workspaceSlug)}/projects/${projectId}/overview`,
  scans: (workspaceSlug: string, projectId: string) =>
    `${workspacePath(workspaceSlug)}/projects/${projectId}/scans`,
  scanDetail: (workspaceSlug: string, projectId: string, scanId: string) =>
    `${workspacePath(workspaceSlug)}/projects/${projectId}/scans/${scanId}`,
  scanLive: (workspaceSlug: string, projectId: string, scanId: string) =>
    `${workspacePath(workspaceSlug)}/projects/${projectId}/scans/${scanId}/live`,
  findings: (workspaceSlug: string, projectId: string) =>
    `${workspacePath(workspaceSlug)}/projects/${projectId}/findings`,
  findingDetail: (workspaceSlug: string, projectId: string, findingId: string) =>
    `${workspacePath(workspaceSlug)}/projects/${projectId}/findings/${findingId}/overview`,
  replayDetail: (workspaceSlug: string, projectId: string, findingId: string, replayId: string) =>
    `${workspacePath(workspaceSlug)}/projects/${projectId}/findings/${findingId}/replay?replay=${replayId}`,
  newScan: (workspaceSlug: string, projectId: string) =>
    `${workspacePath(workspaceSlug)}/projects/${projectId}/scans/new`,
  scopePolicy: (workspaceSlug: string, projectId: string) =>
    `${workspacePath(workspaceSlug)}/projects/${projectId}/policy/scope`,
  // NOTE: the auth route group /(auth)/sign-in serves public path /sign-in;
  // /auth/sign-in does not exist (no such route, no rewrite).
  signIn: (returnTo: string) => `/sign-in?returnTo=${encodeURIComponent(returnTo)}`,
};

export interface WorkspaceNavCounts {
  openScans?: number;
  openFindings?: number;
}

/** Rail sections for the workspace shell (L09/L10 reuse this model). */
export function getWorkspaceSections(
  workspaceSlug: string,
  mode: ExperienceMode,
  counts: WorkspaceNavCounts = {},
): NavSectionData[] {
  const label = (text: string) => modeNavLabel(mode, text);
  const sections: NavSectionData[] = [
    {
      key: "workspace",
      items: [
        {
          key: "overview",
          label: label("Overview"),
          href: appPaths.overview(workspaceSlug),
          icon: "beacon",
        },
        {
          key: "projects",
          label: label("Projects"),
          href: appPaths.projects(workspaceSlug),
          icon: "box",
        },
        {
          key: "scans",
          label: label("Scans"),
          href: `${workspacePath(workspaceSlug)}/scans`,
          icon: "activity",
          badge: counts.openScans ?? undefined,
        },
        {
          key: "findings",
          label: label("Findings"),
          href: `${workspacePath(workspaceSlug)}/findings`,
          icon: "shield",
          badge: counts.openFindings ?? undefined,
        },
        {
          key: "fixes",
          label: label("Fixes & Replays"),
          href: `${workspacePath(workspaceSlug)}/remediations`,
          icon: "check-circle",
        },
      ],
    },
    {
      key: "configure",
      label: label("Configure"),
      items: [
        {
          key: "reports",
          label: label("Reports"),
          href: `${workspacePath(workspaceSlug)}/reports`,
          icon: "file",
        },
        {
          key: "automation",
          label: label("Automation"),
          href: `${workspacePath(workspaceSlug)}/automation`,
          icon: "zap",
        },
        {
          key: "integrations",
          label: label("Integrations"),
          href: `${workspacePath(workspaceSlug)}/integrations/github`,
          icon: "server",
        },
        {
          key: "team",
          label: label("Team"),
          href: `${workspacePath(workspaceSlug)}/team`,
          icon: "users",
        },
        {
          key: "settings",
          label: label("Settings"),
          href: `${workspacePath(workspaceSlug)}/settings`,
          icon: "settings",
        },
      ],
    },
  ];
  if (mode === "builder") {
    return sections.filter((section) => !isDeveloperOnlySection(section.key));
  }
  return [
    ...sections,
    {
      key: "developers",
      label: "Developers",
      items: [
        {
          key: "api-keys",
          label: "API keys",
          href: `${workspacePath(workspaceSlug)}/developers/api-keys`,
          icon: "keyhole",
        },
        {
          key: "mcp",
          label: "MCP",
          href: `${workspacePath(workspaceSlug)}/developers/mcp`,
          icon: "terminal",
        },
      ],
    },
  ];
}

/** Rail sections for a project context (L09/L10 reuse this model). */
export function getProjectSections(
  workspaceSlug: string,
  projectId: string,
  mode: ExperienceMode,
  activeScanCount = 0,
): NavSectionData[] {
  const label = (text: string) => modeNavLabel(mode, text);
  return [
    {
      key: "project",
      items: [
        {
          key: "project-overview",
          label: label("Overview"),
          href: appPaths.projectOverview(workspaceSlug, projectId),
          icon: "beacon",
        },
        {
          key: "project-scans",
          label: label("Scans"),
          href: appPaths.scans(workspaceSlug, projectId),
          icon: "activity",
          badge: activeScanCount > 0 ? activeScanCount : undefined,
        },
        {
          key: "project-findings",
          label: label("Findings"),
          href: appPaths.findings(workspaceSlug, projectId),
          icon: "shield",
        },
        {
          key: "project-policy",
          label: label("Scope & policy"),
          href: appPaths.scopePolicy(workspaceSlug, projectId),
          icon: "shield-check",
        },
        {
          key: "project-settings",
          label: label("Settings"),
          href: `${workspacePath(workspaceSlug)}/projects/${projectId}/settings`,
          icon: "settings",
        },
      ],
    },
  ];
}

/** Breadcrumb trail for overview pages (shared shell contract). */
export function workspaceCrumbs(
  workspaceName: string,
  trail: { label: string; href?: string }[] = [],
) {
  return [{ label: workspaceName }, ...trail];
}
