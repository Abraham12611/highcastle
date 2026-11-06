# PostgreSQL Data Model & Schema Contract

**Status:** detailed target schema; migrations are authored by L02 owner during foundation. Prefer Drizzle + UUID primary keys, UTC timestamptz, explicit workspace partitioning, foreign keys and index strategy. Better Auth auth tables are generated from its tested adapter/schema, not manually invented here.

## Global conventions
- Primary IDs UUID (choose one generation method), API string.
- `created_at`, `updated_at` timestamptz; store UTC.
- Stable ordinal `seq` for scan events; unique (`scan_id`, `seq`).
- Workspace scoped rows always carry `workspace_id` where feasible to enforce tenant filtering.
- No raw auth cookies or customer secrets in database scan events.
- No unrestricted JSON blobs for security-critical authorization fields; use typed columns + immutable policy JSON snapshot/hash.
- Soft delete for projects; hard delete artifacts by retention job with audit minimal trail.
- Worker outbox and queue processing idempotent; separate read model from mutable state.

## Identity and ownership (H limited; B rich)
**Better Auth-managed:** user, session, account/provider identity, verification; generated tables per actual version.
**workspaces:** id PK, slug unique, name, owner_user_id, status, created_at, updated_at.
**workspace_members:** workspace_id FK, user_id FK, role enum owner/admin/developer/viewer, joined_at, unique(workspace_id,user_id); index(user_id).
**workspace_invites [B]:** id, workspace_id, invite_hash unique, role, recipient_email_hash, expires_at, accepted_at, invited_by.
**user_preferences:** user_id PK, experience_mode builder/developer, timezone, accessible_display_settings JSON.

## Project/source/target layer
**projects:** id, workspace_id, slug, name, description nullable, kind demo/repo/url, lifecycle enum draft/ready/needs_attention/paused/archived, created_by, created_at, updated_at, archived_at; unique(workspace_id,slug); index(workspace_id,lifecycle).
**project_sources [B]:** id, workspace_id, project_id, provider github, installation_id nullable, repo_node_id/owner/name, default_branch, selected_ref, immutable_commit_sha, permission_status, connected_at/disconnected_at; unique(project_id,provider,repo_node_id).
**targets:** id, workspace_id, project_id, environment_id, label, canonical_origin, verification_status, verification_method, verified_by, verified_at, verification_expires_at, target_kind demo/staging/approved_other, state; index(project_id,state).
**environments:** id, workspace_id, project_id, label, kind attack_twin/staging, current_revision (image digest/git SHA), fixture_version, provision_status, network_profile_id, created_at, destroyed_at; index(project_id).
**test_identities:** id, workspace_id, environment_id, label (Alice/Bob), role, synthetic boolean default true, fixture_subject_id, credential_secret_ref (never actual cookie), active flag; index(environment_id,role).
**target_verifications [B/L]:** id, target_id, challenge_type, challenge_hash, verified_at, expires_at, evidence_ref.
**authorization_scopes:** id, workspace_id, project_id, target_id, version integer, actor_user_id, status active/revoked/expired, allowed_hosts JSON string array, allowed_paths, denied_paths, allowed_test_pack_ids, allowed_methods, max_duration_seconds, max_requests, max_concurrency, max_memory_mb, max_cpu, network_profile, permitted_environment_id, approved_at, expires_at, scope_hash unique; index(target_id,status). H locked scope for lab.
**test_approvals [B]:** id, scan_id, attempt_proposal_hash, approving_user_id, decision allow/deny, reason, expires_at.

## Scanning and evidence
**scans:** id, workspace_id, project_id, scope_id, source_snapshot_ref, target_id, environment_id, target_revision, fixture_version, scan_type enum, test_pack_versions JSON, requested_by_user_id, idempotency_key, status enum, stage, plan_version, planned_count, executed_count, confirmed_count, started_at, ended_at, cancel_requested_at, failure_code, public_demo flag, created_at, updated_at.
Unique(workspace_id,idempotency_key) when non-null; indexes(project_id,created_at DESC), (status,created_at), (workspace_id,created_at).
**scan_events:** id, workspace_id, scan_id, seq bigint, event_type, phase, actor_type user/model/worker/policy/runner/oracle, safe_summary, payload_redacted JSONB, attempt_id nullable, occurred_at; unique(scan_id,seq), index(scan_id,occurred_at).
**agent_proposals:** id, scan_id, model_call_id, schema_version, raw_proposal_redacted JSONB, structured_plan JSONB, validation_status, rejection_code, policy_hash, created_at. Do not store arbitrary raw prompts with credentials.
**model_calls:** id, scan_id, provider always vultr in H, model, purpose, request_id, tokens_input nullable, tokens_output nullable, latency_ms, outcome, error_code, created_at.
**test_attempts:** id, workspace_id, scan_id, pack_id, pack_version, hypothesis_id, plan_hash, scope_hash, actor_identity_id, target_revision, attempt_number, status proposed/validated/running/completed/failed/blocked/inconclusive, started_at, ended_at, runner_id, oracle_version, verifier_verdict, verdict_reason_code, positive_control_passed nullable, negative_security_condition_met nullable; index(scan_id,started_at), unique(scan_id,plan_hash,attempt_number).
**evidence_artifacts:** id, workspace_id, scan_id, attempt_id nullable, artifact_kind redacted_request/redacted_response/browser_screenshot/runner_stdout/containment/oracle/code_reference, storage_kind db/object, storage_key (non-guessable), sha256, byte_size, content_type, redacted boolean, retention_until, created_at. Never expose direct storage_key to browser; signed short-lived URL only after scoped auth.
**containment_events:** id, workspace_id, scan_id, attempt_id nullable, runner_id, rule_id, policy_version, denied_operation, allowed boolean, runtime_enforced boolean, observed_at, safe_metadata JSONB; index(scan_id,observed_at).
**runner_instances:** id, scan_id, sandbox_id, image_digest, network_profile, resource_limits JSON, status, created_at, started_at, terminated_at, cleanup_verified_at, timeout_at, exit_code, reason; watchdog index(status,created_at).

## Findings, fixes, replay
**findings:** id, workspace_id, project_id, stable_fingerprint, title, summary, category CWE/OWASP, severity, confidence, remediation_status, first_seen_at, last_seen_at, latest_confirmed_attempt_id nullable, owner_user_id nullable, created_at, updated_at; unique(project_id,stable_fingerprint).
**finding_occurrences:** id, finding_id, scan_id, attempt_id nullable, source_revision, target_revision, evidence_confidence, observed_at, oracle_verdict, unique(finding_id,scan_id,attempt_id) where defined.
**finding_history:** id, finding_id, from_status, to_status, actor_type, actor_id nullable, reason, created_at; immutable/audited.
**remediations:** id, workspace_id, project_id, finding_id, source_commit_before, source_commit_after nullable, summary, fix_prompt_redacted text, required_invariants JSON, status suggested/applied/pending_verification/verified/failed, created_at, updated_at.
**replays:** id, workspace_id, project_id, finding_id, original_attempt_id, original_scan_id, replay_scan_id, patched_environment_id, patched_revision, pack_id, pack_version, approval_scope_id, positive_assertion_passed nullable, negative_assertion_passed nullable, verdict verified_fixed/still_vulnerable/regression/inconclusive, created_at, completed_at; index(finding_id,created_at).
**audit_events:** id, workspace_id nullable for operator, actor_user_id nullable, actor_type, action, entity_type, entity_id, policy_hash, redacted_details JSONB, created_at. Append-only; index(workspace_id,created_at).

## Async / integration (H queue, B extended)
**job_outbox (if using transactional producer):** id, topic, key unique, payload JSON, status, created_at, delivered_at; pg-boss has own schema for jobs. Use outbox only if needed for atomic DB writes and publishing.
**github_installations [B]:** id, workspace_id, app_installation_id unique, account_id, state, permissions JSON, connected_at.
**integration_events [B]:** provider, external_delivery_id unique, signature_verified, status, processed_at.
**scheduled_scans [B]:** project_id, scope_id, schedule_cron, timezone, next_run_at, enabled, resource_budget.
**notifications [B]:** user_id, workspace_id, type, safe_body, target_entity, read_at, created_at.
**usage_records [L]:** workspace_id, scan_id, resource_type, units, currency/credit_cost nullable, state.
**api_keys [L]:** workspace_id, secret_hash, scopes, expires_at, revoked_at; never plaintext.

## Required indexes and constraint examples
~~~sql
-- Illustrative, migration owner must adapt to chosen schema.
CREATE UNIQUE INDEX uq_scan_events_order ON scan_events(scan_id, seq);
CREATE UNIQUE INDEX uq_project_finding_fp ON findings(project_id, stable_fingerprint);
CREATE INDEX ix_scan_project_recent ON scans(project_id, created_at DESC);
CREATE INDEX ix_artifact_tenant_attempt ON evidence_artifacts(workspace_id, attempt_id);
CREATE INDEX ix_containment_scan_time ON containment_events(scan_id, observed_at);
~~~

## Consistency rules
- Project, scan, attempt, evidence, finding and replay workspace IDs must correspond; server verifies join, DB FK/trigger can enforce stronger constraints.
- Confirmed finding requires recorded confirmed test_attempt with verified oracle verdict and matching scope/target revision.
- Verified fixed requires replay with negative security condition absent AND positive legitimate operation passing, on documented patched revision.
- Canceled jobs still retain audit events and safe evidence.
- Event seq strictly increasing within scan; event payload sanitized.
- Repository source and target may exist independently; never make GitHub install proxy for target authorization.

## Migration / fixture approach
- Auth schema generated with Better Auth + tested adapter; application schema in `packages/db/src/schema/`.
- Migration files immutable and additive, tests run on clean DB and upgrade DB.
- Separate demo target-lab DB/schema and credentials to prevent synthetic vulnerable tables from sharing SaaS security domain.
- Seed Alice (tenant_A), Bob (tenant_B), invoice_A and invoice_B with synthetic emails/data; no production PII.
- Test via query of workspace A cannot read B objects even if guessing UUID.
