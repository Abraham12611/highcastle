# Complete HighCastle Sitemap & Route Inventory

This is the full **target** product IA. Release markers: [H] hackathon, [B] private beta, [L] public launch, [E] enterprise/expansion. Paths describe **designed** routes, not implemented code. Important: the hackathon must not implement every route.

## Layer 1 — public / marketing
~~~text
/
├── /                                      [H] Landing
├── /product                               [L] Overview
│   ├── /product/how-it-works              [L]
│   ├── /product/attack-twin               [L]
│   ├── /product/proof-engine              [L]
│   ├── /product/attack-replay             [L]
│   ├── /product/patchproof                [L]
│   └── /product/continuous-security       [L]
├── /solutions                             [L] Audience index
│   ├── /solutions/vibe-coders             [L]
│   ├── /solutions/developers              [L]
│   ├── /solutions/startups                [L]
│   ├── /solutions/agencies                [L]
│   └── /solutions/enterprise              [E]
├── /integrations                          [L] Public directory
│   ├── /integrations/github               [B]
│   ├── /integrations/coding-agents        [B]
│   ├── /integrations/deployments          [L]
│   └── /integrations/api                  [L]
├── /demo                                  [H] Interactive showcase
│   ├── /demo/assessment                   [H] Lab assessment
│   ├── /demo/finding                      [H] Synthetic sample finding
│   └── /demo/replay                       [H] Proof before/after
├── /pricing                               [L]
├── /security                              [L] Security practices
├── /trust                                 [L] Trust/privacy
├── /about                                 [L]
├── /contact                               [L]
├── /changelog                             [L]
├── /blog                                  [L]
├── /status                                [L]
├── /docs                                  [B] Docs hub
│   ├── /docs/quickstart                   [B]
│   ├── /docs/concepts                     [B]
│   ├── /docs/projects                     [B]
│   ├── /docs/connecting-github            [B]
│   ├── /docs/connecting-apps              [L]
│   ├── /docs/test-environments            [B]
│   ├── /docs/scans                        [B]
│   ├── /docs/findings                     [B]
│   ├── /docs/remediation                  [B]
│   ├── /docs/ci-cd                        [B]
│   ├── /docs/sandboxing                   [B]
│   ├── /docs/security-policies            [B]
│   ├── /docs/api                          [L]
│   ├── /docs/mcp                          [L]
│   ├── /docs/self-hosting                 [E]
│   └── /docs/troubleshooting              [B]
├── /legal/terms                           [L]
├── /legal/privacy                         [L]
├── /legal/acceptable-use                  [H]
├── /legal/authorized-testing              [H]
└── /legal/responsible-disclosure          [L]
~~~

## Layer 2 — identity & onboarding
~~~text
/auth/
├── /auth/sign-up                          [H]
├── /auth/sign-in                          [H]
├── /auth/github/callback                  [H/B]
├── /auth/verify-email                     [B]
├── /auth/recover                          [B]
├── /auth/reset                            [B]
├── /auth/error                            [H]
└── /auth/sign-out                         [H]

/invite/:inviteToken                       [B]

/onboarding/
├── /onboarding/welcome                    [H]
├── /onboarding/mode                       [H]
├── /onboarding/goal                       [B]
├── /onboarding/workspace                  [H]
├── /onboarding/project                    [H]
├── /onboarding/connection                 [H]
│   ├── /onboarding/connection/github      [B]
│   ├── /onboarding/connection/url         [L]
│   └── /onboarding/connection/demo        [H]
├── /onboarding/environment                [H/B]
├── /onboarding/authorization              [H]
├── /onboarding/preflight                  [H]
├── /onboarding/review                     [H]
├── /onboarding/first-scan                 [H]
└── /onboarding/complete                   [B]
~~~

## Layer 3 — authenticated workspace, projects and investigation
~~~text
/app                                  Redirect to last accessible workspace
└── /app/w/:workspaceSlug/
    ├── /overview                           [H] Workspace home
    ├── /activity                           [B] Workspace activity
    ├── /projects                           [H] Project index
    ├── /projects/new                       [H] Project wizard
    └── /projects/:projectId/
        ├── /overview                       [H] Project dashboard
        ├── /setup                          [H] Setup checklist
        ├── /source                         [B] Source
        ├── /source/changes                 [B] Source changes
        ├── /source/recon                   [B] Recon map
        ├── /targets                        [B]
        ├── /targets/new                    [B/L]
        ├── /targets/:targetId              [B/L]
        ├── /environments                   [H/B]
        ├── /environments/:environmentId    [B]
        ├── /test-identities                [H/B]
        ├── /threat-map                     [B]
        ├── /scans                          [H] Scan history
        ├── /scans/new                      [H] New assessment
        ├── /scans/:scanId/
        │   ├── /overview                   [H] Results
        │   ├── /live                       [H] Live stream
        │   ├── /plan                       [H] Approved steps
        │   ├── /attempts                   [H] Tests
        │   ├── /attempts/:attemptId        [H] Test detail
        │   ├── /evidence                   [H] Evidence index
        │   ├── /containment                [H] Sandbox events
        │   ├── /logs                       [H] Redacted logs
        │   └── /report                     [H/B] Scan report
        ├── /findings                       [H] Project findings
        ├── /findings/:findingId/
        │   ├── /overview                   [H] Finding overview
        │   ├── /attack-path                [H/B] Code/path
        │   ├── /proof                      [H] Execution evidence
        │   ├── /replay                     [H] Reproduce
        │   ├── /fix                        [H] Fix prompt
        │   ├── /history                    [B]
        │   ├── /discussion                 [B]
        │   └── /related                    [L]
        ├── /fixes                          [B] Remediation queue
        ├── /fixes/:remediationId           [B]
        ├── /replays                        [H/B] Replay index
        ├── /replays/:replayId              [H/B] Comparison
        ├── /reports                        [B]
        ├── /reports/new                    [B]
        ├── /reports/:reportId              [B]
        ├── /automation                     [B]
        │   ├── /automation/pr-reviews       [B]
        │   ├── /automation/schedules        [B]
        │   ├── /automation/deployments      [L]
        │   └── /automation/security-gates   [B]
        ├── /policy                         [H/B]
        │   ├── /policy/scope                [H]
        │   ├── /policy/approvals            [B]
        │   ├── /policy/test-budgets         [B]
        │   └── /policy/retention            [L]
        └── /settings                       [H/B]
            ├── /settings/general            [B]
            ├── /settings/access             [B]
            └── /settings/danger             [L]
~~~

## Layer 4 — workspace-wide tools
~~~text
/app/w/:workspaceSlug/
├── /scans                                 [B] All-project scans
├── /findings                              [B] All-project findings
├── /remediations                          [B] All-project fixes
├── /reports                               [B] Workspace reports
├── /integrations                          [B]
│   ├── /integrations/github               [B]
│   ├── /integrations/github/:installation [B]
│   ├── /integrations/webhooks             [L]
│   ├── /integrations/notifications        [B]
│   ├── /integrations/deployments          [L]
│   └── /integrations/coding-agents        [L]
├── /developers                            [L]
│   ├── /developers/api-keys               [L]
│   ├── /developers/api-logs               [L]
│   ├── /developers/mcp                    [L]
│   └── /developers/webhook-deliveries     [L]
├── /team                                  [B]
│   ├── /team/members                      [B]
│   ├── /team/invitations                  [B]
│   └── /team/roles                        [L]
├── /usage                                 [B/L]
├── /billing                               [L]
│   ├── /billing/plan                      [L]
│   ├── /billing/payment-methods           [L]
│   ├── /billing/invoices                  [L]
│   └── /billing/credits                   [L]
├── /notifications                         [B]
├── /audit-log                             [B]
└── /settings                              [B]
    ├── /settings/general                   [B]
    ├── /settings/security                  [B]
    ├── /settings/default-policies          [B]
    ├── /settings/data-retention            [L]
    └── /settings/danger                    [L]
~~~

## Layer 5 — personal area and operations
~~~text
/account/
├── /account/profile                      [B]
├── /account/security                     [B]
├── /account/sessions                     [B]
├── /account/preferences                  [H/B]
├── /account/notifications                [B]
├── /account/connected-accounts           [B]
├── /account/workspaces                   [B]
└── /account/delete                       [L]

/internal/                                 [restricted; never public navigation]
├── /internal/overview                    [H] Worker/scan health
├── /internal/jobs                        [H]
├── /internal/jobs/:jobId                 [H]
├── /internal/workers                     [H]
├── /internal/sandboxes                   [H]
├── /internal/inference-usage             [B]
├── /internal/webhook-deliveries          [B]
├── /internal/security-events             [H]
├── /internal/incidents                   [B]
├── /internal/customer-support            [B]
└── /internal/audit                       [B]
~~~

## Navigation shell policy
- Public header: Logo (home), Product, Solutions, How it works, Demo, Docs, Pricing, Sign in, Get started. Future links that do not exist must not be rendered as working routes.
- Workspace sidebar: workspace switcher, Overview, Projects, Scans, Findings, Fixes & Replays, Reports, Automation, Integrations, Settings; notifications/profile in top bar. Mobile collapsed drawer.
- Project tab row: Overview, Scans, Findings, Fixes, Attack surface, Settings; show environment and verification status.
- Builder labels: Scans→Security checks; Findings→Security issues; Fixes→Fix and retest; Evidence→Proof; Policy→Testing permissions. Same URLs.
- Breadcrumbs preserve workspace and project. App root redirects only to a workspace the authenticated user can access.
- Deep links must recheck session and permission; never preload protected evidence into public HTML.

## H-only route consolidation
Ship 9 primary visible surfaces: Landing, Sign in/Quick start, Workspace overview, Project overview, New assessment, Live investigation, Scan results, Finding detail, Fix/replay. Multiple logical subroutes may render tab content within a shared page. Preserve distinct API/storage contracts for plan, attempts, evidence and containment. Other pages display no misleading placeholder that pretends to work.

## Modal registry
See `07_MODALS_AND_OVERLAYS.md` M01–M60. Modals generally do not get URLs unless a complex flow has refresh/recovery needs. Long setup and authorization use dedicated routes.
