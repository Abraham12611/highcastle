# @highcastle/ui — Nocturne Signal design system

Original dark-theme component library for HighCastle: midnight blue-black
surfaces, luminous mint primary, cyan evidence, ultraviolet/violet model
context, coral signal risk. All artwork (fortress mark, illustrations,
icons) is authored in-house — no third-party assets are vendored.

**Lane L06.** Owns `packages/ui/**` and `apps/web/public/brand/**`.

## Install / wire up (Next.js App Router)

The library ships two independent layers:

1. **Runtime styles (required)** — plain CSS, no Tailwind build needed:

   ```css
   /* apps/web/src/app/globals.css */
   @import "tailwindcss";
   @import "@highcastle/ui/styles.css";
   ```

   Apply `class="hc-root"` to `<body>` (or keep using the provided body
   base styles — both work; `hc-root` sets font family/size).

2. **Tailwind v4 utilities (optional)** — `bg-hc-primary`, `text-hc-muted`,
   `border-hc-line`, `font-display`, `shadow-pixel`, …:

   ```css
   @import "@highcastle/ui/theme.css";      /* @theme token mapping   */
   @source "../../../../packages/ui/src";   /* let Tailwind see .hc-* /
                                              utility usage in this pkg */
   ```

   (`@source` is needed because pnpm-linked workspace packages live under
   `node_modules`, which Tailwind does not auto-scan.)

3. **Fonts**: no font files are bundled (licensing). The display stack
   `var(--hc-font-display)` falls back to ui-monospace; a licensed
   pixel/bitmap face may be self-hosted by the app later and declared
   first in that stack.

```tsx
import { Button, ScanStatusBadge, Timeline } from "@highcastle/ui";
```

React 19 peer. Client components carry `"use client"` in their emitted
code — import from server components is safe (they stay server-side
unless they use hooks).

## Component map

| Area | Exports |
|---|---|
| Identity | `FortressMark`, `FortressLogo` (12×12 grid, `FORTRESS_GRID`, `fortressPathD`) |
| Actions | `Button` (primary/secondary/ghost/destructive, sm/md/lg, `loading`), `IconButton`, `ButtonRow`, `CopyButton` |
| Status — **independent axes** | `SeverityBadge`, `SeverityMeter`, `ConfidenceBadge`, `RemediationBadge`, `VerdictBadge` (oracle+replay), `ScanStatusBadge`, `PhaseBadge`, `AttemptStatusBadge`, `ActorBadge`, `AssertionChip`, `StatusPill` |
| Surfaces | `Panel`/`PanelHeader`/`PanelBody`/`PanelFooter`, `Callout` |
| Navigation | `TopBar`, `NavRail` (collapsible, `renderItem` hook for router links) |
| Forms | `Field`, `TextInput`, `TextArea`, `Select`, `Checkbox` |
| Tabs / steps | `Tabs` (roving tabindex, arrows/Home/End), `Stepper` |
| Timeline | `Timeline` (seq, actor/phase badges, expandable, `aria-current`), `TimelineLiveIndicator` |
| Evidence | `EvidenceCard` (kind, integrity hash, redaction, attempt ref), `CodeBlock` (numbered, copy, scroll-region focusable), `SnapshotPill` |
| Replay | `ReplayDiff` — before/after assertion matrix |
| Scope / safety | `ScopePanel`, `ContainmentLedger`, `BlockedState` |
| States | `EmptyState` (watchtower art), `ErrorState` (diagnostic ref), `LoadingState`, `InconclusiveState`, `Skeleton`, `Spinner` |
| Overlays | `Modal`, `Drawer`, `ConfirmModal` — focus trap, ESC (unless `requireExplicitAction`), focus restore, scroll lock |
| Art | `PerimeterArt`, `ContainmentDiagram`, `ProofChainDiagram`, `WatchtowerArt` |
| Domain types | `Severity`, `Confidence`, `RemediationStatus`, `OracleVerdict`, `ReplayVerdict`, `ScanStatus`, `ScanPhase`, `ActorType`, `AttemptStatus`, `EvidenceKind`, `Tone`, `HC_COLORS` |

The domain union types mirror `@highcastle/contracts` enum values 1:1 —
pass contract values straight through.

## Design rules baked in

- **Honesty axes**: model/hypothesis = violet, executed output = cyan,
  oracle/verifier = mint; severity, confidence and remediation are never
  merged into one chip and never conveyed by color alone (icon + text
  always present).
- **Inconclusive ≠ safe**: `InconclusiveState`/`not_reproduced` use
  subdued slate, never success styling.
- **Reduced motion**: every animation (`hc-pulse`, scanline, shimmer,
  spinner, overlay entry) is gated behind
  `@media (prefers-reduced-motion: no-preference)`.
- **Focus**: `2px` mint focus ring via `.hc-*:focus-visible`; code
  scroll regions are keyboard-focusable.
- **Verified contrast**: `src/contrast.test.ts` computes real WCAG
  ratios — body ≥12:1, muted ≥6.5:1, subtle ≥4.5:1, status labels on
  washes ≥4.5:1.
- **Touch**: interactive targets ≥40px; checkbox rows and nav items are
  full-area click targets.

## Scripts

```bash
pnpm --filter @highcastle/ui build       # tsc → dist (types + "use client" preserved)
pnpm --filter @highcastle/ui typecheck
pnpm --filter @highcastle/ui test        # 116 unit + a11y-contrast tests
pnpm --filter @highcastle/ui lint
pnpm --filter @highcastle/ui example     # regenerate examples/gallery.html
pnpm --filter @highcastle/ui brand       # regenerate apps/web/public/brand assets
```

`examples/gallery.html` is a self-contained showcase (open directly in a
browser — plain CSS, no build). All gallery content is labelled sample
fixture data; the components never fabricate scan results.

## Brand assets

`apps/web/public/brand/` — `favicon.svg`, `icon.svg`, `logo.svg` (+cyan,
mono variants), `cover.svg`, PNG icons 64/180/192/512. Regenerate with
`pnpm --filter @highcastle/ui brand` after changing `FORTRESS_GRID` or
`HC_COLORS`; `apps/web/public/brand/README.md` documents usage.

## Licenses

All icons, artwork, the fortress mark and CSS are original work authored
for HighCastle (repo MIT). No Sandchest assets, no third-party icon/font
files. Font stacks reference system/open fonts by name only — any future
bundled pixel font needs its license recorded before shipping.
