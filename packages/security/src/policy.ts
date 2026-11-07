import {
  AuthorizationScopeSchema,
  EnvironmentSchema,
  ProjectSchema,
  TargetSchema,
  TestPackIdSchema,
  TestPackMethodSchema,
  type ScopeHash,
  type TestPackMethod,
} from "@highcastle/contracts";
import {
  allowDecision,
  denyDecision,
  denyReason,
  type PolicyDecision,
  type PolicyDenyReason,
} from "./decisions.js";
import { computeScopeHash, verifyScopeHash } from "./scope-hash.js";
import { checkScopeRelations, checkScopeStatus } from "./scope-gate.js";
import {
  DEFAULT_OPERATOR_CAPS,
  OperatorExecutionCapsSchema,
  intersectExecutionBudget,
} from "./budgets.js";
import {
  checkMethodPermitted,
  checkPackAuthorization,
  getPackManifest,
  resolvePermittedMethods,
} from "./packs.js";
import {
  checkSetupOperationPermitted,
  normalizeSetupPath,
  resolveSetupOperations,
} from "./prerequisites.js";
import { checkTargetAliasPermitted, resolveTargetServiceAlias } from "./target-alias.js";
import { checkPathPermitted } from "./paths.js";
import { assertSafeHostname, isHostInScope } from "./url-policy.js";
import { validateModelProposal } from "./proposal.js";
import { z } from "zod";

/**
 * Deterministic policy engine — the trusted boundary between AI-generated
 * test proposals and permitted execution.
 *
 * `evaluatePlanAuthorization` walks the full precedence chain and returns an
 * immutable allow/deny decision. `evaluateRequestAuthorization` gates one
 * HTTP-level action (method/path/host) against the same approved scope.
 *
 * Design rules (non-negotiable):
 * - Every input is `unknown` and re-parsed through the frozen Zod contracts —
 *   callers' TypeScript types are not evidence of validity.
 * - Fail closed: any malformed input, missing policy, hash mismatch or
 *   expired/revoked scope is a deny. An exception in evaluation is a deny.
 * - The model is never a policy authority: it names an enumerated pack;
 *   everything else comes from the approved scope, operator caps and the
 *   pack manifest. The model may only narrow the approved surface.
 * - Stages run in precedence order and stop at the first failing stage —
 *   later checks are never run on data already proven untrustworthy.
 */

const MethodParamSchema = TestPackMethodSchema;
const PathParamSchema = z.string().min(1).max(1024);
const HostParamSchema = z.string().min(1).max(253);

export interface PlanAuthorizationInput {
  /** AuthorizationScope row (re-validated; hash re-computed). */
  scope: unknown;
  /** Verified project the scope claims to cover. */
  project: unknown;
  /** Verified target the scope claims to cover. */
  target: unknown;
  /** Verified environment the scope claims to cover. */
  environment: unknown;
  /** Raw model proposal (untrusted). */
  proposal: unknown;
  /** Deployment-time operator ceiling; defaults to the strictest H caps. */
  operatorCaps?: unknown;
  /** Evaluation instant — injectable for deterministic tests. */
  now?: Date;
}

export function evaluatePlanAuthorization(input: PlanAuthorizationInput): PolicyDecision {
  try {
    const now = input.now ?? new Date();

    // --- Stage 1: parse every input through the frozen contracts ---------
    const scope = AuthorizationScopeSchema.safeParse(input.scope);
    if (!scope.success) {
      return denyDecision(
        [denyReason("scope_malformed", "authorization scope failed contract validation")],
        null,
      );
    }
    const relationReasons: PolicyDenyReason[] = [];
    const project = ProjectSchema.safeParse(input.project);
    if (!project.success) {
      relationReasons.push(denyReason("project_malformed", "project failed contract validation"));
    }
    const target = TargetSchema.safeParse(input.target);
    if (!target.success) {
      relationReasons.push(denyReason("target_malformed", "target failed contract validation"));
    }
    const environment = EnvironmentSchema.safeParse(input.environment);
    if (!environment.success) {
      relationReasons.push(
        denyReason("environment_malformed", "environment failed contract validation"),
      );
    }
    const operatorCaps = OperatorExecutionCapsSchema.safeParse(
      input.operatorCaps ?? DEFAULT_OPERATOR_CAPS,
    );
    if (!operatorCaps.success) {
      relationReasons.push(
        denyReason("operator_caps_malformed", "operator execution caps failed validation"),
      );
    }
    if (
      relationReasons.length > 0 ||
      !project.success ||
      !target.success ||
      !environment.success ||
      !operatorCaps.success
    ) {
      return denyDecision(relationReasons, scope.data.scopeHash);
    }

    // --- Stage 2: integrity — the snapshot must match its approval -------
    if (!verifyScopeHash(scope.data)) {
      return denyDecision(
        [
          denyReason(
            "scope_hash_mismatch",
            "scope content does not match its immutable scopeHash — possible post-approval mutation",
          ),
        ],
        scope.data.scopeHash,
      );
    }

    // --- Stage 3: scope validity (status, expiry, not-yet-valid) ---------
    const statusReasons = checkScopeStatus(scope.data, now);
    if (statusReasons.length > 0) {
      return denyDecision(statusReasons, scope.data.scopeHash);
    }

    // --- Stage 4: authorization relations --------------------------------
    const relationCheck = checkScopeRelations(
      scope.data,
      {
        project: project.data,
        target: target.data,
        environment: environment.data,
      },
      now,
    );
    if (relationCheck.length > 0) {
      return denyDecision(relationCheck, scope.data.scopeHash);
    }

    // --- Stage 5: untrusted model proposal -------------------------------
    const proposal = validateModelProposal(input.proposal);
    if (!proposal.ok) {
      const code =
        proposal.rejectionCode === "empty_proposal"
          ? "proposal_empty"
          : proposal.rejectionCode === "stale_version"
            ? "proposal_stale_version"
            : proposal.rejectionCode === "forbidden_field"
              ? "proposal_forbidden_field"
              : proposal.rejectionCode === "unknown_pack"
                ? "proposal_unknown_pack"
                : "proposal_malformed";
      return denyDecision(
        [
          denyReason(
            code,
            `model proposal rejected (${proposal.rejectionCode}): ${proposal.detail}`,
          ),
        ],
        scope.data.scopeHash,
      );
    }

    // --- Stage 6: pack authorization against the scope --------------------
    const packId = proposal.proposal.requestedTest.packId;
    const packReasons = checkPackAuthorization(scope.data, packId);
    if (packReasons.length > 0) {
      return denyDecision(packReasons, scope.data.scopeHash);
    }

    // --- Stage 7: executable target — only the owned demo lab -------------
    const aliasReasons = checkTargetAliasPermitted(target.data);
    if (aliasReasons.length > 0) {
      return denyDecision(aliasReasons, scope.data.scopeHash);
    }
    const alias = resolveTargetServiceAlias(target.data);
    if (alias === null) {
      return denyDecision(
        [denyReason("unsupported_target_kind", "no executable service alias for this target")],
        scope.data.scopeHash,
      );
    }

    // --- Stage 8: budget intersection — model may narrow, never widen -----
    const manifest = getPackManifest(packId);
    const limits = intersectExecutionBudget(scope.data, operatorCaps.data, packId);
    const permittedMethods = resolvePermittedMethods(scope.data, packId);
    if (permittedMethods.length === 0) {
      return denyDecision(
        [
          denyReason(
            "method_not_permitted",
            "intersection of pack methods and scope methods is empty",
          ),
        ],
        scope.data.scopeHash,
      );
    }

    // --- Allow: immutable execution envelope for L13 → L14 ---------------
    return allowDecision(
      {
        kind: "execution" as const,
        scopeId: scope.data.id,
        packId,
        packVersion: manifest.version,
        targetServiceAlias: alias,
        permittedMethods: [...permittedMethods],
        setupOperations: [...resolveSetupOperations(packId)],
        limits,
        expiresAt: scope.data.expiresAt,
      },
      scope.data.scopeHash,
    );
  } catch {
    // Policy evaluation itself failed — fail closed, never allow.
    return denyDecision(
      [denyReason("scope_malformed", "policy evaluation error; failing closed")],
      null,
    );
  }
}

// ---------------------------------------------------------------------------
// Per-request gate
// ---------------------------------------------------------------------------

export interface RequestAuthorizationInput {
  /** AuthorizationScope row (re-validated; status re-checked). */
  scope: unknown;
  /** HTTP method of the requested action. */
  method: unknown;
  /** Request path (query stripped during normalization). */
  path: unknown;
  /**
   * Request hostname, when the caller has one (validated targets, redirect
   * chains). Omit for the lab-alias execution path — the runner only knows
   * `target-lab` and never consumes a hostname.
   */
  host?: unknown;
  /** Pack the request belongs to (method must be in manifest ∩ scope). */
  packId: unknown;
  /**
   * "test" (default): a pack test action — method must be in the
   * manifest∩scope intersection and path inside scope.
   * "setup": an explicitly-declared runner prerequisite (e.g. the session
   * login POST) — gated by PACK_PREREQUISITES, never by widening the
   * test-action surface.
   */
  purpose?: "test" | "setup";
  now?: Date;
}

/**
 * Gate a single HTTP-level action. Used by L13/L14 for per-attempt checks
 * and by redirect/follow-up validation: the same approved scope, the same
 * fail-closed rules, without re-running plan validation.
 */
export function evaluateRequestAuthorization(input: RequestAuthorizationInput): PolicyDecision {
  try {
    const now = input.now ?? new Date();

    const scope = AuthorizationScopeSchema.safeParse(input.scope);
    if (!scope.success) {
      return denyDecision(
        [denyReason("scope_malformed", "authorization scope failed contract validation")],
        null,
      );
    }

    if (!verifyScopeHash(scope.data)) {
      return denyDecision(
        [denyReason("scope_hash_mismatch", "scope content does not match its immutable scopeHash")],
        scope.data.scopeHash,
      );
    }

    const statusReasons = checkScopeStatus(scope.data, now);
    if (statusReasons.length > 0) {
      return denyDecision(statusReasons, scope.data.scopeHash);
    }

    const packId = TestPackIdSchema.safeParse(input.packId);
    if (!packId.success) {
      return denyDecision(
        [
          denyReason(
            "pack_unknown",
            `pack ${JSON.stringify(input.packId)} is not an enumerated test pack`,
          ),
        ],
        scope.data.scopeHash,
      );
    }
    const packCheck = checkPackAuthorization(scope.data, packId.data);
    if (packCheck.length > 0) {
      return denyDecision(packCheck, scope.data.scopeHash);
    }

    const purpose = input.purpose ?? "test";

    // --- Purpose-specific action checks -----------------------------------
    let approval:
      | { kind: "request"; method: TestPackMethod; path: string }
      | { kind: "setup"; method: "GET" | "POST"; path: string };

    if (purpose === "setup") {
      const setupReasons = checkSetupOperationPermitted(
        packId.data,
        scope.data.deniedPaths,
        input.method,
        input.path,
      );
      if (setupReasons.length > 0) {
        return denyDecision(setupReasons, scope.data.scopeHash);
      }
      const setupMethod = input.method === "POST" ? ("POST" as const) : ("GET" as const);
      const setupPath = normalizeSetupPath(String(input.path)) ?? String(input.path);
      approval = { kind: "setup" as const, method: setupMethod, path: setupPath };
    } else {
      const method = MethodParamSchema.safeParse(input.method);
      if (!method.success) {
        return denyDecision(
          [
            denyReason(
              "method_not_permitted",
              `method ${JSON.stringify(input.method)} is not an enumerated test method`,
            ),
          ],
          scope.data.scopeHash,
        );
      }

      const path = PathParamSchema.safeParse(input.path);
      if (!path.success) {
        return denyDecision(
          [denyReason("path_not_permitted", "request path is malformed")],
          scope.data.scopeHash,
        );
      }

      const methodCheck = checkMethodPermitted(scope.data, packId.data, method.data);
      if (methodCheck.length > 0) {
        return denyDecision(methodCheck, scope.data.scopeHash);
      }

      const pathCheck = checkPathPermitted(scope.data, path.data);
      if (!pathCheck.permitted || pathCheck.normalizedPath === null) {
        return denyDecision(
          [pathCheck.reason ?? denyReason("path_not_permitted", "path outside scope")],
          scope.data.scopeHash,
        );
      }
      approval = {
        kind: "request" as const,
        method: method.data,
        path: pathCheck.normalizedPath,
      };
    }

    // --- Shared host check (purpose-independent) ---------------------------
    let host: string | null = null;
    if (input.host !== undefined) {
      const parsedHost = HostParamSchema.safeParse(input.host);
      if (!parsedHost.success) {
        return denyDecision(
          [denyReason("unsafe_hostname", "request host is malformed")],
          scope.data.scopeHash,
        );
      }
      const hostReasons = assertSafeHostname(parsedHost.data);
      if (hostReasons.length > 0) {
        return denyDecision(hostReasons, scope.data.scopeHash);
      }
      if (!isHostInScope(parsedHost.data, scope.data.allowedHosts)) {
        return denyDecision(
          [
            denyReason(
              "host_out_of_scope",
              `host ${JSON.stringify(parsedHost.data)} is not in the authorized host scope`,
            ),
          ],
          scope.data.scopeHash,
        );
      }
      host = parsedHost.data;
    }

    return allowDecision(
      {
        ...approval,
        scopeId: scope.data.id,
        host,
      },
      scope.data.scopeHash,
    );
  } catch {
    return denyDecision(
      [denyReason("scope_malformed", "policy evaluation error; failing closed")],
      null,
    );
  }
}

/**
 * Recompute the scope hash for persistence/audit when a caller already holds
 * a parsed scope (re-exported convenience so consumers don't re-implement).
 */
export function scopePolicyHash(scope: unknown): ScopeHash | null {
  const parsed = AuthorizationScopeSchema.safeParse(scope);
  if (!parsed.success) return null;
  return computeScopeHash(parsed.data);
}
