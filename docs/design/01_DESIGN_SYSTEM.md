# HighCastle Visual Design System — Nocturne Signal

**Design intent:** deep midnight observatory / cyber-fortress, geometric pixel craft, precise technical clarity, crisp fluorescent contrasts. Take inspiration from Sandchest's expressive dark technical interfaces and pixel-art confidence, **not** its amber/brown palette, chest icon, font treatment, exact page compositions or copied assets.

## Original palette
The primary dark is blue-black, not warm espresso. Main accent is **mint-cyan**, paired with electric orchid/violet and small signal-coral risks.

| Token | HEX | Role |
|---|---|---|
| `--hc-bg` | #080D1A | Primary page background |
| `--hc-surface-1` | #10192A | Panels, nav, cards |
| `--hc-surface-2` | #18263B | Hover and elevated surfaces |
| `--hc-surface-3` | #22344C | Inputs/active fills |
| `--hc-line` | #30445B | Borders/dividers |
| `--hc-text` | #EFF8F7 | Main readable text |
| `--hc-muted` | #9FB2C5 | Secondary text |
| `--hc-subtle` | #778CA4 | Tertiary; only large/nonessential |
| `--hc-primary` | #62F5D1 | Interactive mint, selected, safe |
| `--hc-primary-deep` | #0D5B58 | Mint dark fill |
| `--hc-violet` | #A48BFF | AI planning/model context |
| `--hc-cyan` | #63CFFF | Evidence and execution |
| `--hc-coral` | #FF708A | Critical failure/risk |
| `--hc-orange` | #FFA66B | High severity/warning |
| `--hc-amber` | #FFD46B | Medium (small use only) |
| `--hc-low` | #8CABC1 | Low/informational |
| `--hc-success` | #75E7B4 | Verified success |
| `--hc-focus` | #B8FFF0 | Keyboard focus outline |

Do not use saturated colors as large page backgrounds; reserve for actionable and meaningful states. Check WCAG contrast in production, especially muted text and low-severity label. Use theme HSL/OKLCH if desired but retain verified sRGB fallbacks.

## Typography
- Display: original licensed pixel/bitmap-inspired face for headings **only**; fallback monospace. Do not bundle or distribute fonts without license verification. Avoid using a proprietary or Sandchest-associated font.
- UI/body: clear modern sans-serif (e.g., system sans or open-source Inter), 15–16px base, 1.5 line height.
- Code/metadata: open-source mono (e.g., Geist Mono/system mono), 12–14px, tabular numerals.
- H1 44–64px desktop / 34–42 mobile (pixel display). H2 28–36; H3 20–24. Body minimum 15px; tiny metadata >=12px with adequate contrast.
- Prefer short assertive headlines, sentence-case functional UI, and plain-language business impact.

## Shape, density, rhythm
- 8px spacing scale; 4px microspacing. Layout gutter 24–48 desktop, 16 mobile.
- Radius 4–8px on data panels; 10–12 for major interactive surfaces. Corners subtly cut/notched on hero display frames.
- 1px visible borders (not invisible charcoal), occasional offset pixel shadow of 3–4px for CTA.
- Pixel patterns in sparse borders/glyphs, **not** all text; technical data tables remain legible.
- Use line-connected event timelines and pixel coordinate grid, not Sandchest's identical bar arrays.

## Semantic status, not colors only
| Meaning | Token | Label icon |
|---|---|---|
| Confirmed serious issue | coral | alert-octagon + 'Confirmed' |
| High severity | orange | triangle + 'High' |
| Medium | amber | circle-dot + 'Medium' |
| Low/info | slate | info + name |
| AI hypothesis / planning | violet | brain-circuit + 'Hypothesis' |
| Executed output | cyan | terminal + 'Executed' |
| Verified fixed | mint/success | shield-check + 'Verified fixed' |
| Inconclusive | subdued slate | help-circle + 'Inconclusive' |
| Policy blocked | orange/coral depending severity | shield-off + 'Blocked by scope' |

Colors NEVER alone communicate result. Show severity separate from confidence.

## Page composition (deliberately not Sandchest)
**Landing:** asymmetric hero: left typography/CTA/three-step proposition; right custom radar/fortress visualization, stepped coordinate lines, teal highlighting, violet AI trace. Secondary large proof-before-after section with dark panels.
**Dashboard:** compact dark left rail with unique fortress icon, broader header with workspace/target status, vertical event indicator, 'active assessment' prominent; tables use high contrast and nonpixel body typography.
**Live scan:** split 65% timeline / 35% status and proof column; model hypothesis in violet, executed test cyan, verifier mint/coral. A 'Containment ledger' panel is signature UI.
**Finding:** Builder summary at top; technical tabs below; before/after replay comparison unique to product.
**Onboarding:** large empty space, stepper, guided copy, progressive disclosure; no overwhelming forms.
**Mobile:** single column; drawers for raw evidence; actions pinned appropriately only if they do not cover critical content.

## Components and interactions
- `Button` primary mint fill with ink text and 3px pixel shadow; hover lifts 1px; disabled subdued.
- Secondary outline (#30445B), ghost text; destructive coral with explicit copy.
- `ProjectRow` title, app/source, risk summary, last verified date and status.
- `EvidenceChain` three event cards (hypothesis → execution → verdict) with immutability hash.
- `TimelineNode` phase number, outcome, timestamp, expand button.
- `StatePill` shape + icon + text; never status represented by color only.
- `FortressLogo` original 8x8 or 12x12 grid mark described in art direction.
- `AttackReplayDiff` negative and positive assertions before vs after with annotated execution provenance.
- `ScopeConfirmation` explicit target host/test identities, policies, budget.

## Motion and microinteractions
- Pixel scan line <0.5s, subtle terminal cursor only when an actual step is running.
- Respect prefers-reduced-motion.
- No fake autonomous 'typing thought' stream. Emit actual persisted events.
- Focus ring 2px mint offset 2. Hover and active differences remain keyboard visible.

## Data visualization
- Scan history: rectangular heatmap with distinct cyan (executed) / violet (planned) / coral (confirmed) and labeled legend, not borrowed layout.
- Finding distribution: compact segmented risk bar with textual count by severity.
- Sandboxing: concentric boundary diagram showing host/control plane/runner/target, egress denial event.
- Never use fabricated dashboard activity unless labelled sample fixture.

## CSS variables seed
~~~css
:root {
  color-scheme: dark;
  --hc-bg: #080D1A;
  --hc-surface-1: #10192A;
  --hc-surface-2: #18263B;
  --hc-surface-3: #22344C;
  --hc-line: #30445B;
  --hc-text: #EFF8F7;
  --hc-muted: #9FB2C5;
  --hc-primary: #62F5D1;
  --hc-violet: #A48BFF;
  --hc-cyan: #63CFFF;
  --hc-coral: #FF708A;
  --hc-success: #75E7B4;
}
body { background: var(--hc-bg); color: var(--hc-text); }
~~~

## Quality checklist
No copied icons/mascots/illustrations. Keyboard navigation, 4.5:1 body text contrast, adaptive tables, reduced motion, predictable headings, color+text statuses, text selectable, accessible dark inputs, no fake threat scores and responsive hero.
