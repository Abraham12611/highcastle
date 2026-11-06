# Sensitive Data, Evidence, Secrets, Retention and Audit

## Data classes
| Class | Examples | H storage/handling |
|---|---|---|
| Public content | landing/docs/logo | public |
| Workspace metadata | names, project IDs, status | authenticated RBAC |
| Source data | selected source snapshots (B) | server-only/private, minimal |
| Target credentials | synthetic Alice/Bob test login | secret reference or runner one-time token |
| Provider secrets | Vultr inference, OAuth, storage | web/worker server-only env; never sandbox |
| Execution artifacts | response, screenshot, stdout | sanitize first; workspace ACL |
| Security finding | vulnerable route, test path | private and auditable |
| Audit events | actor, scope, action | append-only, restricted |
| Analytics | token/time/cost counters | aggregated without secrets |

## Secret lifecycle
Provision via host secrets manager/protected env (Coolify secret or Compose env with strict permissions). Never commit real .env values, embed in client bundles, send to model or expose via logs, screenshots, JSON responses or evidence. Rotate on leak, revoke on integration disconnect, alert on misconfiguration. Better Auth secret long random with rotation policy; GitHub client secret never inside runner.

## Evidence processing
1. Runner captures *transient* output from synthetic target.
2. Controller normalizes and redacts Authorization headers, cookies, session identifiers, secret-shaped strings, sensitive fields, tokens.
3. Independent oracle validates relevant synthetic fixture fields before/after redaction; redaction must not alter verdict provenance.
4. Compute SHA256 and store artifact with type, attempt, revision, policy version, timestamps.
5. DB stores metadata, optional private object store holds binary/text; short signed URL only after workspace RBAC.
6. Browser shows redaction notice and exact limitation; never raw HTML from target rendered unsandboxed.
7. Evidence deleted per retention policy; deletion audit only retains minimal non-sensitive metadata as permitted.

## Retention recommendations
H: ephemeral runner source/workspace destroyed after scan; sanitized synthetic evidence kept for demo and limited age; no real customer information collected. Set an explicit configurable retention period (e.g., 7 days for test artifacts) and rotate/delete after final demo.
B/L: workspace policy with minimum/maximum periods and customer deletion/export controls. Backups must honor policy with clear deletion lag; don't promise instant erasure from backups if not implemented.

## Audit event fields
actor_type, actor ID, workspace/project/scan/attempt, action, allowed/denied, scope hash, policy version, timestamp UTC, request ID, safe detail reason. Audit authentication changes, scan start, scope approvals, model plans rejected, sandbox blocked events, cancellation, finding status, evidence download, emergency stop. Avoid logging raw user query if it contains secret.

## Workspace isolation
Every read/write constrained by membership, project and scan relation. Evidence object names unguessable; object storage bucket private; application proxies download after auth or signs short TTL links. Never return storage credentials to client. If public demo shares synthetic state, ensure it cannot query private customer workspaces.

## Privacy and disclosure
Tell users what source/target info is sent to Vultr inference and what is kept, especially when later processing customer code. H sends minimal controlled lab excerpts. Provide accurate notices on landing and before scans. Don't imply an external vendor model runs on own private GPU.

## Logging
Structured JSON; token/cost counters separate from prompt data; redact headers/URL query credentials, mask emails even synthetic if desired. Debug logs never leak secrets; production logging default minimal. Scan event safeSummary should be safe to show in UI.

## Acceptance tests
- Pattern-based secret redaction and allowlist field filtering.
- Evidence retrieval from another workspace denied.
- Runner environment has no Vultr/DB/GitHub credential.
- Stored artifact hash matches sanitized bytes shown/downloaded.
- Deleting artifact removes accessible object and prevents stale URL reuse.
- Operator break-glass access logged, test within simulated context.
