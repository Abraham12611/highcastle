# @highcastle/contracts

Shared TypeScript/Zod domain contracts for HighCastle (lane L03, Phase A).
Single source of truth connecting the frontend, backend, database, agent
orchestrator, sandbox executor, and independent verifier. This package
performs **no network or database calls** — it is pure schemas + pure
functions.

## Contract catalog

| Module           | Exports (schemas / types / helpers)                                                                                       | Spec source                                     | Consumed by        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------ |
| `version.ts`     | `CONTRACT_SCHEMA_VERSION`, `ContractSchemaVersionSchema`, `isSupportedContractSchemaVersion`                               | architecture/05_API_CONTRACTS                  | all lanes          |
| `ids.ts`         | Branded UUIDs: `WorkspaceId`, `UserId`, `ProjectId`, `TargetId`, `EnvironmentId`, `TestIdentityId`, `AuthorizationScopeId`, `ScanId`, `AttemptId`, `ProposalId`, `ModelCallId`, `EvidenceArtifactId`, `ContainmentEventId`, `RunnerInstanceId`, `FindingId`, `FindingOccurrenceId`, `FindingHistoryId`, `RemediationId`, `ReplayId`, `AuditEventId` | architecture/03_DATABASE_SCHEMA                 | L02, L18           |
| `enums.ts`       | `WorkspaceRole`, `ProjectLifecycle`, `ProjectReadiness`, `TargetState`, `TargetKind`, `EnvironmentKind`, `ProvisionStatus`, `TestIdentityRole`, `ScopeStatus`, `ScanType`, `ScanStatus` + `isTerminalScanStatus`, `ScanPhase`, `ActorType`, `ScanEventType`, `AttemptStatus`, `OracleVerdict`, `TestPackId` + `TEST_PACK_MANIFEST`, `EvidenceArtifactKind`, `ContainmentRuleId`, `Severity`, `Confidence`, `RemediationStatus`, `TriageTargetStatus`, `ReplayVerdict`, `ModelProvider`, `JobType`, `ApiErrorCode` | schema + states + test-pack specs               | all lanes          |
| `common.ts`      | `IsoUtcDateTime`, `Sha256Hex`/`ScopeHash`, `SemVer`, `SafeSummary`, `AttemptNonce`, `IdempotencyKey`, `ProjectSlug`, cursor pagination, `RequestId` | architecture/03 + 05                            | all lanes          |
| `projects.ts`    | `CreateProjectRequest`, `Project`, `CreateTargetRequest`, `Target`, `CreateEnvironmentRequest`, `Environment`, `TestIdentity` (synthetic-only, `synthetic: true`) | architecture/03_DATABASE_SCHEMA                 | L02, L18, L08      |
| `scopes.ts`      | `CreateAuthorizationScopeRequest` (+ `SCOPE_HARD_CAPS`), `AuthorizationScope`, `PreflightRequest/Response`                 | security/02_CONTAINMENT_AND_AUTHORIZATION       | L04, L13, L18, L02 |
| `scans.ts`       | `CreateScanRequest/Response`, `Scan`, `ScanEvent` (+ `isNextEventSeq`), `ScanSummary` (+ `toScanSummary`), `AttemptSummary`, history/event queries, cancel/retry | architecture/05 + 06, states spec               | L16, L17, L18, L09 |
| `hypothesis.ts`  | `Hypothesis`, `RequestedTest`, `ModelProposal` (strict, pack-enumerated), `ProposalRejectionCode`, `ModelCall`, `AgentProposal`, `MAX_MODEL_REPLANS` | architecture/05 (LLM proposal contract)        | L12, L13, L16      |
| `sandbox.ts`     | `TargetServiceAlias` (`target-lab` only), `CredentialRef` (opaque), `SandboxResourceLimits` (+ `SANDBOX_HARD_CAPS`), `SandboxRequest`, `SandboxResult`, `ContainmentEvent`, `RunnerInstance` | architecture/05 (runner protocol) + security/02 | L14, L13, L15, L02 |
| `findings.ts`    | `Finding` (severity/confidence/status axes), `FindingOccurrence`, `FindingHistory`, `EvidenceArtifact` (always redacted), `Remediation`, `FixPromptResponse`, `TriageFindingRequest` (excludes `verified_fixed`) | architecture/03 + agents/02                     | L15, L16, L18, L10 |
| `replay.ts`      | `ReplayRequest` (no verdict field), `Replay`, `VerificationVerdict` (+ `evaluateAttemptVerdict`, `buildVerificationVerdict`), `evaluateReplayVerdict` | agents/02, states spec                          | L15, L16, L18, L10 |
| `api.ts`         | `ok`/`fail` envelope builders, `ApiError`, `API_ERROR_HTTP_STATUS`, `SafeErrorDetails`                                    | architecture/05_API_CONTRACTS                  | L18, L17           |

Import from the root only: `import { ScanSchema } from "@highcastle/contracts"`.
Deep `src/` imports are not a supported surface.

## Security rule (non-negotiable)

Model output cannot grant itself execution permissions. Enforced by schema
construction, not convention:

- `RequestedTest` names an **enumerated pack ID only** — no command, URL,
  host, tool, permission, or credential field exists anywhere in the proposal
  shape, not even optional.
- All request/proposal objects are `.strict()`: injected keys
  (`shellCommand`, `targetUrl`, `grantPermissions`, …) fail validation.
- `ReplayRequest` and `TriageFindingRequest` structurally exclude their
  verdict fields: `verified_fixed` is derivable only by the deterministic
  oracle (`evaluateReplayVerdict`) over recorded runner output.
- `SandboxRequest` targets an allowlisted service alias (`target-lab`) with
  an opaque credential *reference*; secret values never enter a contract.

## Lane interfaces

- **L02 (db):** mirror entity schemas (`Project`, `Target`, `Environment`,
  `AuthorizationScope`, `Scan`, `ScanEvent`, `Attempt`-adjacent summaries,
  `EvidenceArtifact`, `ContainmentEvent`, `RunnerInstance`, `Finding*`,
  `Remediation`, `Replay`) in Drizzle tables; enforce `unique(scan_id, seq)`,
  `unique(project_id, stable_fingerprint)`, `unique(workspace_id,
  idempotency_key)`.
- **L04 (security):** consume `scopes.ts` caps + `ScopeHash`, intersect
  `ModelProposal.requestedTest.packId` against the approved scope; own the
  `scopeHash` computation and redirect/DNS policy.
- **L14 (sandbox):** implement the `sandbox.ts` protocol; only the controller
  constructs `SandboxRequest`; echo `nonce`; emit `ContainmentEvent` rows for
  every runtime denial with `allowed: false, runtimeEnforced: true`.
- **L15 (test-packs):** implement `TEST_PACK_MANIFEST["bola-invoice-v1"]`
  exactly (GET-only, ≤8 requests, ≤30s); feed observations into
  `buildVerificationVerdict` / `evaluateReplayVerdict` — never hand-set a
  verdict string.
- **L12/L13/L16/L17/L18:** parse every inbound body, param, model output,
  event payload, and runner result with the matching schema; persist events
  before publishing; re-validate scope at claim time.

## Versioning

- Wire version: `CONTRACT_SCHEMA_VERSION` (currently `1`). Every versioned
  object carries `schemaVersion: 1`.
- Additive enum values, new optional fields, or new modules require a minor
  package bump + coordinator sign-off; removing/renaming fields or changing
  validation semantics requires a new `schemaVersion` literal with a
  versioned union parser + an ADR entry.
- Changes to shared schemas after the F1 freeze need a contract-change issue
  and coordinator acceptance (AGENTS.md § Branching).

## Commands

```bash
pnpm --filter @highcastle/contracts typecheck
pnpm --filter @highcastle/contracts test
pnpm --filter @highcastle/contracts build
pnpm --filter @highcastle/contracts lint
```

No root files are touched by this package. `zod` is pinned (`3.23.8`);
promotion to the workspace `catalog:` is a coordinator/L01 decision.
