# Art Direction, Original Pixel Motifs & Assets

## Reference study
The user-supplied Sandchest screenshots demonstrate a cohesive retro-technical vocabulary: dramatic nearly-black backgrounds; warm amber/yellow highlights; pixelated chest mascot/logo; blocky display type; dense monospace data; strong thin rules; rows for scans, findings, CVEs and repos; demo transparency; small pixel-hacker personalization.

**HighCastle should inherit the quality of visual conviction, not the actual design.** Do not use Sandchest's orange chest, yellow button, warm-black background, identical screen structure, pixel hacker portrait, exact font, copy, spacing or charts as shipped assets.

## HighCastle's own visual story
**Theme:** Nocturne Signal — a midnight-blue fortress with cyan defensive light beams and ultraviolet scanning pulses. Vocabulary: bastions, ramparts, beacon, watchtowers, perimeter, signal, proof chain, replay.
**Hero imagery:** original isometric fortress built from modular 8x8 blocks, vulnerable orange/coral seam illuminated, cyan protective perimeter, violet scanning beam. Could be CSS/SVG pixel art authored from scratch rather than generated stock.
**Logo:** a distinct blocky 'H' formed from two crenellated towers and a central gateway / shield, with negative-space lock/keyhole. 12x12 grid with 2px stepped outline. No chest box, lid, key-on-chest, yellow gradients or copying specific Sandchest pixel art.
**Favicon:** cyan H/rampart mark on navy square, visible at 16x16 and 32x32, no tiny details.
**Mascot:** optional late-stage 'The Watcher', a small angular floating lighthouse drone with one teal lens. Not a hooded hacker or voice-personality clone; leave out hackathon if it compromises evidence UI.

## Original illustration briefs
1. **Landing hero 'Perimeter under test':** dark navy scene with stepped architecture, thin vector lines, small cyan packets, one coral attempted entry, violet hypothesis arrow; reserve readable left text.
2. **Proof Engine:** three linked panels: Violet hypothesis, cyan execution trace, mint verified verdict.
3. **Containment:** transparent nested boundaries labeled Host, Control plane, Ephemeral runner, Test application; failed attempt stopped at explicit boundary.
4. **Attack Replay:** two mini application states before/after with same actor arrows and different policy results; avoid hacker glamour.
5. **Empty state:** quiet watchtower outline, one muted moving beacon, friendly CTA.
6. **Error state:** blocked signal icon with explicit error, not a threatening skull.
7. **Social share/cover:** HighCastle wordmark, fortress perimeter, concise claim 'Prove the bug. Prove the fix.'

## Component art
- A grid of rectangular fortress crenellations to emphasize progress, not identical Sandchest square matrix.
- Fine dotted angular connector paths linking agent sub-steps, colored by phase.
- Pixel-offset emphasis for only CTA and key proof statistics.
- Badge shapes distinct: squared with a notched corner, no copied bars.
- Original code snippet style with contrasting syntax mint/violet/coral.

## Asset and ownership rules
- Prefer SVG/CSS and original artwork authored in-house; license any third-party typefaces and icons properly.
- Keep screenshot source references in docs; never commit Sandchest screenshots or adapted art into public product repo without rights. The user attachments were visual references only.
- Store final HighCastle assets in `apps/web/public/brand/`, original design sources under `design/assets/` if created; document licenses in `docs/references/01_SOURCES_AND_INSPIRATION.md`.
- Logo must pass legibility at 16px, monochrome, dark and light contrast; test against low-res screens.
- Use a pixel display font only for controlled headline moments; body should remain readable and accessible.

## Copy voice
- Direct, competent, calm: 'Reproduced', 'Here is the evidence', 'This test was blocked', 'Retest the fix'.
- Avoid 'unrestricted, uncensored hacker', grandiose 'impenetrable', or claims of exploits on users' real infrastructure.
- Sample headline options: 'Find the weak point before it finds you.' / 'Prove the risk. Prove the fix.' / 'Security testing for people shipping at AI speed.'
- Keep ethical/authorized target language visible.

## Output artifacts designers must supply
Original scalable logo SVG and favicon, 1440px and 390px landing compositions, workspace shell, scan live screen, finding detail, before/after replay, auth/onboarding, empty/error/blocked/inconclusive states, tokens and component map, accessible color contrast notes.
