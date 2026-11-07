# Evidence Checklist — Live Values Only, Never Manufactured

Rule: a field is either filled with an observed value from the deployed
system or marked **PENDING**. Placeholder IDs, unrecorded runs, and
“representative” numbers are forbidden.

## Verified live model evidence (2026-11-07, direct Vultr calls)

| Field | Value |
|---|---|
| Provider | `vultr` (`https://api.vultrinference.com/v1`) |
| Requested model | `glm-5.3-flash` |
| Provider-reported `responseModel` (call 1) | `glm-5.3-flash` — no substitution |
| Provider-reported `responseModel` (call 2) | `glm-5.3-flash` — no substitution |
| Request ID (call 1) | `chatcmpl-aa297c8c-04ec-44f2-8230-4bc4385feb74` |
| Request ID (call 2) | `chatcmpl-9b580e5e-6f7a-4e75-8be6-55d9044321ca` |
| Latency (call 1 / call 2) | 2096 ms / 5934 ms |
| Tokens in/out (call 1) | 382 / 619 |
| Tokens in/out (call 2) | 382 / 682 |
| Validation | `ModelProposalSchema` **valid**, pack `bola-invoice-v1`, both calls |
| Safe failure | forced 50 ms timeout → `code=timeout`, exit 1, static message |
| Subscription | `highcastle-hackathon` (`06c483db-d35f-4e3b-acd8-9149755e6ad6`), usage ledger confirms billed `glm-5.3-flash` activity |
| Full log | issue #36 evidence comments |

## Pending — record only from the deployed E2E run (issue #45)

| Field | Status | Where it comes from |
|---|---|---|
| Deployed `develop` SHA | PENDING | merge commit the demo runs on |
| Public URL | PENDING | L19 deployment |
| Scan ID | PENDING | scan record in DB |
| Policy/scope hash | PENDING | scope authorization event |
| Target image digests (vuln + patched) | PENDING | lab revision attestation |
| Attempt ID (baseline + security) | PENDING | runner result + evidence artifact |
| Oracle verdict + assertions | PENDING | independent verifier output |
| Containment event ID | PENDING | runtime deny + policy event |
| Runner ID + cleanup proof | PENDING | controller destroy + janitor |
| Finding ID | PENDING | finding upsert linked to attempt |
| Replay ID + `verified_fixed` | PENDING | replay vs patched revision |
| Demo video URL | PENDING | record per `video-storyboard.md` after #45 |

## Pre-publish secret sweep (run before every recording and PR)

- [ ] `grep -ri` for `sk-`, `api[_-]?key\s*[:=]`, `Bearer`, private IPs in
      `docs/delivery/demo-assets/**` and any pasted terminal output.
- [ ] No `~/.vultr-cli.yaml`, `.env*`, or credential files in the worktree.
- [ ] Video frames contain no keys, tokens, VM IPs, or credentials.
- [ ] Request IDs and digests only — never raw prompts, bodies, or keys.
