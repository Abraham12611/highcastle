# HTTP API, SSE and Shared Contract Specification

## Philosophy
Next.js route handlers are the trusted BFF/API. Every inbound body, route param, query, model output, event payload and sandbox result is Zod-validated. All endpoints are versioned under `/api/v1`; user session authenticates, DB joins authorize, and authorization_scope validates active execution. Errors are structured and do not leak cross-tenant existence. Endpoint shapes below are **contract proposals** for bootstrap to implement.

## Envelope and errors
Responses: `{ data: T, meta?: object }`; errors: `{ error: { code: string, message: string, requestId: string, details?: SafeDetails } }`. UTC ISO timestamps; UUID IDs. HTTP 201 created, 202 queued, 400 malformed, 401 no session, 403 forbidden/policy denied, 404 missing or inaccessible, 409 duplicate/version conflict, 422 valid shape but unsafe/unsatisfied preflight, 429 quota/rate, 500 internal, 503 unavailable.

Mutation requirements: CSRF/session protection, idempotency for job-creating calls, explicit workspace-bound authorization. Do not leak raw model prompt or sandbox credentials.

## Auth/project endpoints
| Method | Path | Purpose |
|---|---|---|
| GET | /api/v1/me | user, preferences, workspace memberships |
| PATCH | /api/v1/me/preferences | mode builder/developer |
| GET | /api/v1/workspaces | accessible workspaces |
| POST | /api/v1/workspaces | create workspace; owner role |
| GET | /api/v1/workspaces/:wid/projects | project list scoped to workspace |
| POST | /api/v1/workspaces/:wid/projects | create draft |
| GET | /api/v1/projects/:pid | project + readiness + real counts |
| PATCH | /api/v1/projects/:pid | project allowed edits |
| GET | /api/v1/projects/:pid/targets | approved targets |
| POST | /api/v1/projects/:pid/targets | target draft (B/L) |
| POST | /api/v1/projects/:pid/authorization-scopes | signed explicit scope authorization |
| GET | /api/v1/projects/:pid/authorization-scopes/current | immutable active scope summary |
| POST | /api/v1/projects/:pid/preflight | checks without running attack |

## Scan endpoints
| Method | Path | Behavior |
|---|---|---|
| POST | /api/v1/projects/:pid/scans | validate scope and pack, persist snapshot, enqueue, return 202 |
| GET | /api/v1/projects/:pid/scans | cursor-paginated history |
| GET | /api/v1/scans/:sid | scan summary, coverage, versions, counts |
| GET | /api/v1/scans/:sid/events?after=:seq | historical events |
| GET | /api/v1/scans/:sid/stream | SSE stream from seq/Last-Event-ID |
| POST | /api/v1/scans/:sid/cancel | cancel_requested + worker termination |
| POST | /api/v1/scans/:sid/retry | new linked scan with revalidation |
| GET | /api/v1/scans/:sid/attempts | per-attempt summaries |
| GET | /api/v1/attempts/:aid | approved plan + actual output + oracle |
| GET | /api/v1/scans/:sid/containment | policy/runtime block evidence |
| GET | /api/v1/scans/:sid/report | server-generated honest report |

**POST /scans request (H restricted example)**
~~~json
{
  "type": "targeted_red_team",
  "environmentId": "env-uuid",
  "targetId": "target-uuid",
  "authorizationScopeId": "scope-uuid",
  "testPackIds": ["bola-invoice-v1"],
  "sourceRevision": "demo-vulnerable-sha",
  "maxDurationSeconds": 120
}
~~~
Header: `Idempotency-Key`. Response:
~~~json
{
  "data": {
    "scanId": "scan-uuid",
    "status": "queued",
    "eventsUrl": "/api/v1/scans/scan-uuid/stream",
    "scopeHash": "sha256:...",
    "targetRevision": "demo-vulnerable-sha"
  }
}
~~~
H API must **not accept arbitrary testPackIds or target host** beyond owned lab allowlist. Parse then verify server-side.

## Finding/fix/replay endpoints
| Method | Path | Description |
|---|---|---|
| GET | /api/v1/projects/:pid/findings | filter by status/severity/confidence |
| GET | /api/v1/findings/:fid | outcome, impact, evidence summary, source, status |
| GET | /api/v1/findings/:fid/occurrences | linked scans and attempts |
| POST | /api/v1/findings/:fid/fix-prompt | return nonsecret structured guidance |
| POST | /api/v1/findings/:fid/replays | validate updated environment, enqueue replay |
| GET | /api/v1/replays/:rid | original/replay attempts and assertion comparison |
| POST | /api/v1/findings/:fid/triage | B: status reason; guard verified_fixed |
| GET | /api/v1/artifacts/:eid | authorize workspace + return redacted or signed short TTL artifact |

**Replay request**
~~~json
{
  "originalAttemptId": "attempt-uuid",
  "patchedEnvironmentId": "env-uuid",
  "patchedRevision": "demo-patched-sha",
  "authorizationScopeId": "scope-uuid"
}
~~~
Do NOT let client set verifier verdict or 'verified_fixed'. The backend derives and persists it.

## Structured LLM proposal contract
The model may suggest one of the **enumerated** test packs, not arbitrary commands/hosts.
~~~json
{
  "schemaVersion": 1,
  "hypothesis": {
    "category": "broken_object_authorization",
    "targetComponent": "invoice_lookup",
    "reason": "Ownership check may be absent",
    "expectedSecureBehavior": "A customer cannot read another customer's invoice"
  },
  "requestedTest": {
    "packId": "bola-invoice-v1",
    "objective": "Verify ownership enforcement using synthetic identities"
  }
}
~~~
Policy engine intersects allowed pack ID, scope, environment and budget; invalid proposal rejected and logged. Model schema can evolve with a typed versioned union. Never pass model-produced raw shell command into a privileged environment.

## Runner protocol (internal only)
**Controller request** (authenticated through internal service; never public endpoint): scan ID, attempt ID, immutable policy hash, pack ID/version, target service alias from allowlist, synthetic credential references resolved securely by controller for runner only as nonproduction tokens, max time/requests, nonce.
**Runner result:** attempt ID, test status, normalized response metadata/body redacted, observed fixture owner, baseline assertion, negative cross-account assertion, resource usage, containment events, artifact digests. Controller validates schema and nonce; replay duplicate results idempotent.
No external arbitrary URL or free-form shell in runner input.

## SSE event format
~~~text
id: 17
event: scan.stage.updated
data: {"scanId":"scan-uuid","seq":17,"phase":"executing","safeSummary":"Running authorized invoice ownership check","attemptId":"attempt-uuid","occurredAt":"2026-11-06T15:00:00Z"}
~~~
Events persisted before publish, unique seq; auth verified at initial subscription, recheck on reconnect; heartbeat without sensitive content. Last-Event-ID enables catch-up. Fatal client disconnect must not affect durable work.

## API security checks
- Workspace/project joins on every route; never authorize by supplied workspaceSlug alone.
- Prepared queries/Drizzle safe parameterization.
- Restricted origins and safe redirects; CSRF for mutations; rate limits per user/workspace.
- Avoid long-running API handler execution; use queue.
- For evidence: Content-Disposition attachment, CSP / no sniff, sanitize HTML/text, short lived links and logging.
- Internal operator routes on separate auth/network restrictions.
- API tests include cross-workspace access, forged scope, duplicate idempotency key, invalid pack, stale revision, lost session and arbitrary host.

## Contract owners
L02 owns schema; L03 API/auth; L07 contracts; L08 inference schema; L09 sandbox runner protocol; L10 test pack; L11 verifier; L12 event stream. Interfaces freeze at Foundation Gate F1 before parallel implementations.
