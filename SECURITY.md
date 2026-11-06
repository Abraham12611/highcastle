# HighCastle Security Policy

## Authorized use
HighCastle is designed only for applications you own or have explicit permission to test. The hackathon MVP operates only against a controlled synthetic invoice test lab. It is not a public arbitrary-target penetration testing service.

## Supported scope
At this stage, the project is a planning and prototype repository. No production security assurance or warranty is offered. Documented controls become effective only when implemented and verified; read `docs/security/01_THREAT_MODEL.md` and `docs/security/02_CONTAINMENT_AND_AUTHORIZATION.md`.

## Reporting a vulnerability
Do not publish sensitive exploit payloads, production secrets, or private test artifacts in public GitHub issues. Contact the repository owner privately through an appropriate GitHub security reporting channel once configured; until then, avoid posting details publicly. Future SECURITY.md updates will specify a confirmed disclosure address and response process.

## Development secrets
Never commit API keys, OAuth secrets, session keys, personal tokens or real data. Test with synthetic fixtures and sanitization. No cloud or GitHub credential may enter an untrusted sandbox.

## Safety requirements
Every executed test must be scoped and authorized. Vulnerability confirmation requires deterministic evidence. A passing scan does not guarantee safety. Runtime containment includes non-root, network restrictions, resource caps and verified cleanup; adding those to documentation is not equivalent to actually enforcing them.
