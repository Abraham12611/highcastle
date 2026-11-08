import { relations } from "drizzle-orm";
import { auditEvents } from "./audit.js";
import { containmentEvents, evidenceArtifacts, runnerInstances, testAttempts } from "./attempts.js";
import { findingHistory, findingOccurrences, findings, remediations, replays } from "./findings.js";
import { environments, projects, targets, testIdentities } from "./projects.js";
import { agentProposals, modelCalls, scanEvents, scans } from "./scans.js";
import { modelExplanations } from "./explanations.js";
import { authorizationScopes } from "./scopes.js";
import { userPreferences, workspaceMembers, workspaces } from "./tenancy.js";

/**
 * Relational query map for `db.query.*` (used by L18 BFF routes).
 * Kept in one place so table modules never import each other in cycles.
 */
export const workspacesRelations = relations(workspaces, ({ many }) => ({
  members: many(workspaceMembers),
  projects: many(projects),
}));

export const workspaceMembersRelations = relations(workspaceMembers, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceMembers.workspaceId],
    references: [workspaces.id],
  }),
}));

export const userPreferencesRelations = relations(userPreferences, () => ({}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [projects.workspaceId],
    references: [workspaces.id],
  }),
  environments: many(environments),
  targets: many(targets),
  scans: many(scans),
  findings: many(findings),
}));

export const environmentsRelations = relations(environments, ({ one, many }) => ({
  project: one(projects, {
    fields: [environments.projectId],
    references: [projects.id],
  }),
  identities: many(testIdentities),
}));

export const targetsRelations = relations(targets, ({ one, many }) => ({
  project: one(projects, {
    fields: [targets.projectId],
    references: [projects.id],
  }),
  scopes: many(authorizationScopes),
}));

export const testIdentitiesRelations = relations(testIdentities, ({ one }) => ({
  environment: one(environments, {
    fields: [testIdentities.environmentId],
    references: [environments.id],
  }),
}));

export const authorizationScopesRelations = relations(authorizationScopes, ({ one }) => ({
  project: one(projects, {
    fields: [authorizationScopes.projectId],
    references: [projects.id],
  }),
  target: one(targets, {
    fields: [authorizationScopes.targetId],
    references: [targets.id],
  }),
}));

export const scansRelations = relations(scans, ({ one, many }) => ({
  project: one(projects, {
    fields: [scans.projectId],
    references: [projects.id],
  }),
  events: many(scanEvents),
  attempts: many(testAttempts),
  proposals: many(agentProposals),
  modelCalls: many(modelCalls),
  explanations: many(modelExplanations),
  evidence: many(evidenceArtifacts),
  runners: many(runnerInstances),
}));

export const scanEventsRelations = relations(scanEvents, ({ one }) => ({
  scan: one(scans, {
    fields: [scanEvents.scanId],
    references: [scans.id],
  }),
}));

export const modelCallsRelations = relations(modelCalls, ({ one }) => ({
  scan: one(scans, {
    fields: [modelCalls.scanId],
    references: [scans.id],
  }),
}));

export const agentProposalsRelations = relations(agentProposals, ({ one }) => ({
  scan: one(scans, {
    fields: [agentProposals.scanId],
    references: [scans.id],
  }),
}));

export const modelExplanationsRelations = relations(modelExplanations, ({ one }) => ({
  scan: one(scans, {
    fields: [modelExplanations.scanId],
    references: [scans.id],
  }),
}));

export const testAttemptsRelations = relations(testAttempts, ({ one, many }) => ({
  scan: one(scans, {
    fields: [testAttempts.scanId],
    references: [scans.id],
  }),
  evidence: many(evidenceArtifacts),
}));

export const runnerInstancesRelations = relations(runnerInstances, ({ one }) => ({
  scan: one(scans, {
    fields: [runnerInstances.scanId],
    references: [scans.id],
  }),
}));

export const evidenceArtifactsRelations = relations(evidenceArtifacts, ({ one }) => ({
  scan: one(scans, {
    fields: [evidenceArtifacts.scanId],
    references: [scans.id],
  }),
}));

export const containmentEventsRelations = relations(containmentEvents, ({ one }) => ({
  scan: one(scans, {
    fields: [containmentEvents.scanId],
    references: [scans.id],
  }),
}));

export const findingsRelations = relations(findings, ({ one, many }) => ({
  project: one(projects, {
    fields: [findings.projectId],
    references: [projects.id],
  }),
  occurrences: many(findingOccurrences),
  history: many(findingHistory),
  remediations: many(remediations),
  replays: many(replays),
}));

export const findingOccurrencesRelations = relations(findingOccurrences, ({ one }) => ({
  finding: one(findings, {
    fields: [findingOccurrences.findingId],
    references: [findings.id],
  }),
}));

export const findingHistoryRelations = relations(findingHistory, ({ one }) => ({
  finding: one(findings, {
    fields: [findingHistory.findingId],
    references: [findings.id],
  }),
}));

export const remediationsRelations = relations(remediations, ({ one }) => ({
  finding: one(findings, {
    fields: [remediations.findingId],
    references: [findings.id],
  }),
}));

export const replaysRelations = relations(replays, ({ one }) => ({
  finding: one(findings, {
    fields: [replays.findingId],
    references: [findings.id],
  }),
}));

export const auditEventsRelations = relations(auditEvents, () => ({}));
