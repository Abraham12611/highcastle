# Contributing to HighCastle

HighCastle is an original, evidence-first security product. Read `AGENTS.md`, `docs/00_INDEX.md` and `docs/security/02_CONTAINMENT_AND_AUTHORIZATION.md` before making changes.

## Branch and PR process
- Base on owner-designated integration branch (not automatically main), feature branch `feature/lXX-topic`.
- Follow lane ownership in `docs/delivery/02_PARALLEL_WORKSTREAMS.md`.
- No simultaneous schema, contracts, root package or security-policy edits without approval from owner.
- Conventional commit messages.
- PR documents what is truly implemented, tests actually run, and any security implications.
- Never submit copied Sandchest assets, AGPL-derived code, or sensitive credentials.

## Definition of done
Validations and unit tests pass; tenant authorization and scope enforced; safety-sensitive code has negative tests; UI handles empty/error/inconclusive states; tested execution evidence is real, not mocked in deployed path. Contract/API/migration changes are documented. See `docs/delivery/04_INTEGRATION_AND_QA.md`.

## Authorized testing only
Do not use HighCastle to scan other people's public sites, create unrestricted exploit scripts, or deploy untrusted code on the Vultr host. Hackathon test target is intentionally vulnerable synthetic lab. Report possible vulnerabilities responsibly at `SECURITY.md`.

## Current status
Documentation-first bootstrap. Planned scripts in AGENTS.md need to be created by L01 before invoking them.
