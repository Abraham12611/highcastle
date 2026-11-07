# HighCastle brand assets

Original artwork generated from the canonical 12×12 fortress grid
(`packages/ui/src/components/logo.tsx` → `FORTRESS_GRID`). Two
crenellated towers joined by a curtain wall read as an "H"; the
enclosed negative space is a keyhole gateway. Palette: mint `#62F5D1`
mark on navy `#080D1A` (Nocturne Signal).

| File | Purpose |
|---|---|
| `favicon.svg` / `icon.svg` | Mint mark on navy rounded square (16-unit viewBox, 2-unit padding) |
| `icon-64.png` | Small raster icon (4px/cell) |
| `icon-180.png` | Apple touch icon |
| `icon-192.png` / `icon-512.png` | Android/PWA icons |
| `logo.svg` | Standalone mark, transparent ground (mint) |
| `logo-cyan.svg` | Standalone mark (cyan variant) |
| `logo-mono.svg` | Standalone mark (light mono, for dark contexts) |
| `cover.svg` | 1200×630 social share cover — "Prove the bug. Prove the fix." |

## Usage in Next.js

```tsx
// app/layout.tsx metadata
icons: {
  icon: [
    { url: "/brand/favicon.svg", type: "image/svg+xml" },
    { url: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
  ],
  apple: "/brand/icon-180.png",
}
```

For React usage prefer `<FortressMark>` / `<FortressLogo>` from
`@highcastle/ui` rather than the raw SVGs.

## Regeneration

```bash
pnpm --filter @highcastle/ui brand
```

`packages/ui/scripts/render-brand.mts` rasterizes the grid
deterministically (each cell → exact N×N pixels) — no SVG renderer
needed. Re-run after changing the grid or palette.

## Rights

All assets are original work authored for HighCastle (MIT, same as the
repository). Not derived from Sandchest or any third-party pixel art.
