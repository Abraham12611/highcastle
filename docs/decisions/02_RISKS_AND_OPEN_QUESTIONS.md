# Risks, Assumptions, Unresolved Decisions and Owner Actions

## Risks sorted by criticality
| Risk | Probability / impact | Mitigation | Owner/gate |
|---|---|---|---|
| Deadline falls before integration | High/critical | vertical slice first, prune UI extras | Coordinator F1 |
| Vultr model unsuitable for structured plan | Medium/high | benchmark supported models; fixed pack and schema; no external fallback | L12 F1 |
| Browser sandbox memory too heavy | Medium/high | HTTP-based bounded code runner fallback, still real execution | L14 F1 |
| Docker isolation insufficient for arbitrary hostile code | High/critical | H accepts only known synthetic test pack, no untrusted customer builds | L04/L19 F0 |
| Repo remains private at submission | Medium/critical | owner explicitly makes public before deadline, check no secrets | L20 F5 |
| AGPL/copyright contamination | Medium/critical | independent code and art, no Sandchest assets/source | L06/coordinator |
| 20 agents overwrite contracts | High/high | foundation freeze, exclusive paths, PR owner approval | L01 F0 |
| DB schema/auth plugin incompatibility | Medium/high | pinned tested versions, migrations, integration tests | L02/L05 |
| GitHub OAuth slows demo | Medium/medium | public synthetic demo entry, no fake auth | L05 |
| Inference costs exceed credits | Medium/high | token limits, one worker, budgets, account alerts | L12/L19 |
| Model claims false exploit | Medium/critical | oracle only sets reproduced verdict | L15 |
| Sandbox credentials leaked | Low/critical | no provider keys/host mounts, inspect runner env tests | L14/L19 |
| Lab fixture mismatch causes false verdict | Medium/high | pinned revisions and fixtures, baseline, independent ownership | L11/L15 |
| Coolify adds operational complexity | Medium/medium | Compose on same Vultr VM fallback | L19 |
| Broken demo under live load | Medium/high | real stored scan history + backups labelled recorded | L20 |
| Visual design too similar to reference | Medium/high | distinct Nocturne tokens, original logo/art/layout, review | L06 |
| Unclear distinction 'sandboxing' vs target | Medium/high | diagrams and separate runner/target boundaries | L04/L19 |
| SSE disconnect loses events | Medium/medium | DB persist + Last-Event-ID resume | L17 |

## Explicit open decisions (resolve before/between gates)
| Q | Question | Default | Decider |
|---|---|---|---|
| Q01 | Exact Node/pnpm/Next.js versions? | pin tested on F0 | L01 |
| Q02 | Local vs Managed Postgres on Vultr? | managed if ready/affordable, otherwise secured local | L19 + L02 |
| Q03 | Coolify or Compose? | whichever gets stable secure public app faster | L19 |
| Q04 | GitHub OAuth during H? | yes if already verified; public synthetic demo still works | L05 |
| Q05 | Live model ID? | current available supported Vultr model verified with structured output | L12 |
| Q06 | HTTP test only or Playwright full browser? | HTTP for reliability, Playwright if proven | L14/L15 |
| Q07 | Evidence in Object Storage or private VM volume? | object store if provisioned, otherwise private volume with limitations | L19/L02 |
| Q08 | Exactly which H routes are standalone vs tabs? | 9 primary screens, subroutes may be tabs | L08–L10 |
| Q09 | Formal local Docker hardening profile? | nonroot/readonly/caps/limits/allowlisted network | L04/L14 |
| Q10 | Repo license, copyright owner and publication? | MIT-compatible new code; owner confirms copyright/visibility | Owner |
| Q11 | Security contact for disclosure? | owner contact before public launch | Owner |
| Q12 | Scope consent for public demo guests? | preconfigured owned synthetic lab + visible consent | L05/L04 |
| Q13 | Which exact model/tool API supports structured output? | test before committing plan parser | L12 |
| Q14 | How to compare source/target revision? | pinned image digest + lab fixture version | L11/L16 |

## Non-questions already settled by product safety
- No GPU inference assumption in H.
- No arbitrary active scanning of someone else's URL.
- No client-asserted vulnerability verdict.
- No Sandchest branding/assets/AGPL code.
- No fake live event simulation in deployed product.
- No Docker socket/host secrets inside untrusted executor.

## Decision cadence
At F0, resolve Q01, Q02 draft, Q05 feasibility, Q09. At F1, lock Q03/Q04/Q06/Q07/Q08/Q12/Q14. Before submission, lock Q10/Q11 and verify links/visibility. Each divergence updates ADR and affected contracts.
