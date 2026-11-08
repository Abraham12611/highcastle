/**
 * @highcastle/contracts — shared TypeScript/Zod domain contracts.
 *
 * Single import surface for every lane. Consumers MUST import from the
 * package root (`@highcastle/contracts`), never from deep `src/` paths, so
 * internal refactors stay non-breaking.
 *
 * Lane map:
 * - L02 (db): ids, enums, projects, scopes, scans, sandbox, findings, replay
 * - L04 (security): enums, scopes, hypothesis (plan allowlist), sandbox caps
 * - L12 (inference): hypothesis (ModelProposalSchema), enums (outcomes)
 * - L13 (policy gateway): scopes, hypothesis, sandbox (intersection inputs)
 * - L14 (sandbox): sandbox (protocol), scopes (caps), enums (runner states)
 * - L15 (test packs): enums (pack manifest), sandbox (result), replay (oracle)
 * - L16 (orchestrator): scans, hypothesis, sandbox, findings, replay
 * - L17 (events/SSE): scans (events, cursors), enums (event catalog)
 * - L18 (BFF): projects, scopes, scans, findings, replay, api (envelopes)
 * - L09/L10 (UI): scans (summaries), findings, replay (verdicts)
 */

export * from "./version.js";
export * from "./ids.js";
export * from "./enums.js";
export * from "./common.js";
export * from "./projects.js";
export * from "./scopes.js";
export * from "./scans.js";
export * from "./hypothesis.js";
export * from "./sandbox.js";
export * from "./findings.js";
export * from "./replay.js";
export * from "./api.js";
