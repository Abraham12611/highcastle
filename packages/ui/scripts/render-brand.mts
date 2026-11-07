/**
 * Renders HighCastle brand assets from the canonical FORTRESS_GRID
 * (src/components/logo.tsx) into apps/web/public/brand/.
 *
 *   pnpm --filter @highcastle/ui brand
 *
 * PNGs are produced by a minimal deterministic encoder — the mark is
 * literal pixel art, so each grid cell maps to an exact NxN block.
 * Regenerate after any change to the grid or palette.
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { FORTRESS_GRID, fortressPathD } from "../src/components/logo.js";
import { HC_COLORS } from "../src/tokens.js";

const BRAND_DIR = fileURLToPath(new URL("../../../apps/web/public/brand/", import.meta.url));

const MINT = HC_COLORS.primary;
const NAVY = HC_COLORS.bg;

/* ---------- minimal PNG encoder (RGBA, filter 0) ---------- */

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const out = Buffer.alloc(4 + head.length + 4);
  out.writeUInt32BE(head.length, 0);
  head.copy(out, 4);
  out.writeUInt32BE(crc32(head), 4 + head.length);
  return out;
}

function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.subarray(y * width * 4, (y + 1) * width * 4).forEach((v, i) => {
      raw[y * (width * 4 + 1) + 1 + i] = v;
    });
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------- rasterize the grid ---------- */

function hexRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function renderIconPng(pixels: number, padCells = 2): Buffer {
  const grid = FORTRESS_GRID.length; // 12
  const cells = grid + padCells * 2;
  const cell = Math.max(1, Math.round(pixels / cells));
  const size = cells * cell;
  const rgba = new Uint8Array(size * size * 4);
  const [nr, ng, nb] = hexRgb(NAVY);
  const [mr, mg, mb] = hexRgb(MINT);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      rgba[o] = nr;
      rgba[o + 1] = ng;
      rgba[o + 2] = nb;
      rgba[o + 3] = 255;
      const gx = Math.floor(x / cell) - padCells;
      const gy = Math.floor(y / cell) - padCells;
      if (gx >= 0 && gx < grid && gy >= 0 && gy < grid) {
        if (FORTRESS_GRID[gy]?.[gx] === "#") {
          rgba[o] = mr;
          rgba[o + 1] = mg;
          rgba[o + 2] = mb;
        }
      }
    }
  }
  return encodePng(size, size, rgba);
}

/* ---------- svg emitters ---------- */

const D = fortressPathD();

const iconSvg = `<!-- HighCastle app/favicon mark: original 12x12 fortress grid on navy. -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
  <rect width="16" height="16" rx="2" fill="${NAVY}"/>
  <path transform="translate(2 2)" d="${D}" fill="${MINT}"/>
</svg>
`;

const logoSvg = `<!-- HighCastle fortress mark — original artwork, transparent ground. -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" shape-rendering="crispEdges">
  <path d="${D}" fill="${MINT}"/>
</svg>
`;

const logoCyanSvg = `<!-- HighCastle fortress mark, cyan variant. -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" shape-rendering="crispEdges">
  <path d="${D}" fill="${HC_COLORS.cyan}"/>
</svg>
`;

const logoMonoSvg = `<!-- HighCastle fortress mark, monochrome (inherits context). -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" shape-rendering="crispEdges">
  <path d="${D}" fill="#EFF8F7"/>
</svg>
`;

const coverSvg = `<!-- HighCastle social cover — original composition, token colors. -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${NAVY}"/>
  <g stroke="#18263B" stroke-width="1">
    ${Array.from({ length: 15 }, (_, i) => `<path d="M${60 + i * 80} 0V630"/>`).join("\n    ")}
    ${Array.from({ length: 9 }, (_, i) => `<path d="M0 ${60 + i * 70}H1200"/>`).join("\n    ")}
  </g>
  <rect x="80" y="90" width="1040" height="450" rx="10" fill="none" stroke="${HC_COLORS.cyan}" stroke-width="2" stroke-dasharray="14 8" opacity="0.5"/>
  <g transform="translate(120 150) scale(26)">
    <path d="${D}" fill="${MINT}"/>
  </g>
  <text x="500" y="290" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="86" letter-spacing="10" fill="#EFF8F7">HIGHCASTLE</text>
  <text x="503" y="360" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="30" letter-spacing="4" fill="${HC_COLORS.cyan}">PROVE THE BUG. PROVE THE FIX.</text>
  <text x="503" y="420" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="20" letter-spacing="2" fill="#778CA4">Authorized testing on owned, synthetic targets.</text>
</svg>
`;

/* ---------- write ---------- */

mkdirSync(BRAND_DIR, { recursive: true });
const writes: Array<[string, Buffer | string]> = [
  ["icon.svg", iconSvg],
  ["favicon.svg", iconSvg],
  ["logo.svg", logoSvg],
  ["logo-cyan.svg", logoCyanSvg],
  ["logo-mono.svg", logoMonoSvg],
  ["cover.svg", coverSvg],
  ["icon-64.png", renderIconPng(64)],
  ["icon-180.png", renderIconPng(180)],
  ["icon-192.png", renderIconPng(192)],
  ["icon-512.png", renderIconPng(512)],
];
for (const [name, data] of writes) {
  writeFileSync(BRAND_DIR + name, data);
  console.log(`wrote apps/web/public/brand/${name}`);
}
