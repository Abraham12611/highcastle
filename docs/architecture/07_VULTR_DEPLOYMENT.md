# Vultr Deployment & Infrastructure Runbook (Hackathon)

## Mandatory architecture for Challenge 1
1. Vultr Cloud Compute VM hosts **central control and web application**; not merely static hosting.
2. Vultr Serverless Inference handles **all agent LLM calls**. Use base URL https://api.vultrinference.com/v1 with API key on server only.
3. Actual code/browser action runs in separate isolated sandboxed environment on Vultr. Containment demo with actual runtime block.
4. Public URL, public GitHub repo (submission requires it; current planning repo may be private until owner deliberately makes it public), explanatory README, recorded video and lablab.ai submission.
5. Vultr GPUs are unavailable during event; custom abliterated GPU model is not on hackathon path.

Official references: https://community.vultr.com/e/vultr-agent-rush-hackathon ; https://api.vultrinference.com/docs ; https://docs.vultr.com/how-to-use-vultr-s-coolify-marketplace-application ; https://docs.vultr.com/how-to-use-vultr-s-supabase-marketplace-application .

## Recommended smallest workable topology
~~~text
Public Internet
    |
 HTTPS / TLS (Caddy/Traefik)
    |
Vultr VM (private host management)
  ├─ web (Next.js + Better Auth + API + SSE) [server-only secrets]
  ├─ worker (pg-boss orchestrator) [server-only Vultr inference key]
  ├─ postgres (if no managed DB; private listener only)
  ├─ demo-target-vuln / demo-target-patched [synthetic isolated service]
  └─ trusted sandbox-controller
        └─ short-lived runner container [no secrets; allowlisted lab network]
Vultr Serverless Inference ← outbound from worker only
Vultr Object Storage (optional; private) ← evidence via trusted controller
~~~

**Security boundary nuance:** Docker containers on the same host are weaker isolation than dedicated microVMs; H confines execution to our known, synthetic test pack and target. For general untrusted customer source execution, use stronger isolation later. The agent may never direct Docker daemon arguments or change network policy.

## Resource planning
No fixed VM SKU claimed before measuring; provision enough CPU/RAM for web, DB/worker, Playwright Chromium and lab in parallel. Benchmark one runner, then cap concurrent runners at 1 for demo. Keep $200 credit budget visible with alarms, snapshots/backups if available. Don't assume all credits can pay for every service indefinitely.

## Deployment choice: Coolify vs Compose
**Option A, preferred if stable:** Vultr Marketplace Coolify on VM → deploy web, worker, target-lab using separate container definitions → HTTPS, env vars, basic health checks. Keep sandbox controller independent/hardened; Coolify should not be exposed to runner.
**Option B, faster fallback:** Ubuntu Vultr VM with pinned Docker Engine + Docker Compose + reverse proxy; deployment over SSH with audited restricted keys. Clean, explicit network policies.
**Do not use both concurrently** or accidentally place privileged Docker socket in a web container. Document chosen implementation as ADR in source repo.
**Supabase Marketplace:** optional packaged Postgres/Auth/Storage but conflicts with selected Better Auth architecture if deployed without intention; do not add for sponsor points. Managed Postgres preferred when cheap/reachable.

## Provisioning sequence (no credentials in docs)
1. Register/claim authorized hackathon credits; set spending alert.
2. Create Vultr VM with SSH-key-only access; disable password SSH, firewall allow 443/80 and restricted admin SSH only; patch OS.
3. Configure private Docker networks: control, data, isolated lab. Keep Postgres only internal. No host ports published for lab.
4. Deploy Postgres (managed endpoint or local secure) and run migrations; admin password never sent to runner.
5. Deploy web and worker independently with strong env; health /healthz and /readyz.
6. Provision Vultr Serverless Inference key; set model ID and test a genuine response, record provider/model/request ID to DB.
7. Build pinned runner image; test isolation (non-root, dropped caps, read-only FS, tmpfs, pids/memory/cpu limits, seccomp/AppArmor as practical, network egress allowlist).
8. Deploy synthetic target-lab vulnerable and patched revisions, with fixed fixture version.
9. Verify inbound TLS, session cookies, CORS/CSRF and internal API policies.
10. Run real end-to-end scan + replay + forbidden action test in deployed environment; capture evidence.
11. Record video, remove debugging credentials, verify repo and README instructions, submit.

## Container hardening baseline
- Rootless/non-root run user; no `--privileged` or capability escalation.
- Read-only filesystem with explicitly sized tmpfs scratch; avoid writable host bind mounts.
- Drop all Linux capabilities; pids-limit and CPU/memory limits.
- Set no-new-privileges; seccomp/AppArmor where supported.
- No access to Docker socket, container runtime API, Vultr control plane, DB, metadata service or app secrets.
- Deterministic outbound allowlist to lab target. Deny private-network metadata and external DNS/egress, enforce at host/controller network not solely app code. Need test redirect/DNS bypass.
- Terminate after deadline and delete environment; janitor audits.
- For browser automation, pin Playwright version/image and prohibit arbitrary browser extensions/downloads.

## Network and secrets
- Worker to Vultr inference is trusted outbound path; runner has no inference key or direct model access.
- Lab is controlled service alias accessible to runner only on dedicated network; app/public clients cannot change that alias.
- Use short-lived, synthetic test tokens; if runner receives them, they are only valid against lab fixtures and cannot access HighCastle control plane.
- PostgreSQL restricted via firewall, TLS if remote, scoped DB user with least privilege.
- Evidence bucket private, server-mediated retrieval; encryption and retention.

## Monitoring and contingency
- Health: app, DB, worker heartbeat, inference probe, target lab, Docker controller.
- Counters: scan queue, models, cost, runner runtime, orphan containers, blocked egress.
- If Coolify breaks, move to Compose on **same Vultr VM** with known env/state.
- If Managed PostgreSQL setup delayed, use secure self-hosted Postgres and backup before demo.
- If browser headless fails due to memory, use controlled HTTP runner only; challenge allows executed code as Pattern A. Record actual output.
- If inference model fails, choose another supported Vultr model; no external-model substitution while claiming Challenge 1 compliance.
- If external URL/production target requested in H, reject with 'demo-only controlled assessment'.

## Vultr usage in README/video
Show Vultr VM instance/network/architecture without exposing IP credentials; log actual Serverless Inference call metadata; sandbox limits and containment output; explain which Vultr services are core vs optional; never say Vultr API automatically guarantees isolation.

## Go-live checklist
[ ] VM and HTTPS healthy; [ ] API/worker on Vultr; [ ] Vultr inference call succeeds; [ ] UI real SSE; [ ] synthetic lab isolated; [ ] runner egress denied; [ ] artifact storage private; [ ] cleanup verified; [ ] replay baseline+negative test passes; [ ] repo made public before submission only with owner approval; [ ] video publicly accessible; [ ] lablab submission complete.
