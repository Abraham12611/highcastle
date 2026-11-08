import type { CSSProperties } from "react";
import { cx } from "../cx.js";

/**
 * Original illustration primitives (inline SVG, token colors).
 * All artwork below is authored for HighCastle — pixel-stepped
 * fortress geometry in the Nocturne Signal palette.
 */

interface ArtProps {
  width?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Concentric containment boundaries: host → control plane → ephemeral
 * runner → test application, with a blocked egress attempt. This is
 * the signature "the boundary held" diagram for the sandbox panel.
 */
export function ContainmentDiagram({ width = 460, className, style }: ArtProps) {
  return (
    <svg
      viewBox="0 0 460 300"
      width={width}
      className={cx("hc-diagram", className)}
      style={style}
      role="img"
      aria-label="Containment diagram: nested host, control plane, runner and test application boundaries with a denied egress attempt"
    >
      {/* host boundary */}
      <rect
        x="10"
        y="10"
        width="440"
        height="280"
        rx="6"
        fill="none"
        stroke="var(--hc-line-strong)"
        strokeWidth="1.5"
        strokeDasharray="6 4"
      />
      <text x="24" y="30" className="hc-diagram-label" fill="var(--hc-subtle)">
        Host · Vultr VM
      </text>

      {/* control plane */}
      <rect
        x="34"
        y="42"
        width="392"
        height="234"
        rx="6"
        fill="var(--hc-surface-1)"
        stroke="var(--hc-line)"
        strokeWidth="1.5"
      />
      <text x="48" y="62" className="hc-diagram-label" fill="var(--hc-muted)">
        Control plane
      </text>

      {/* ephemeral runner — cyan perimeter */}
      <rect
        x="60"
        y="76"
        width="250"
        height="186"
        rx="6"
        fill="var(--hc-bg)"
        stroke="var(--hc-cyan-deep)"
        strokeWidth="2"
      />
      <text x="74" y="96" className="hc-diagram-label" fill="var(--hc-cyan)">
        Ephemeral runner · no creds
      </text>

      {/* test application */}
      <rect
        x="82"
        y="110"
        width="130"
        height="120"
        rx="4"
        fill="var(--hc-primary-wash)"
        stroke="var(--hc-primary-deep)"
        strokeWidth="1.5"
      />
      <text x="94" y="128" className="hc-diagram-label" fill="var(--hc-primary)">
        Test application
      </text>
      {/* tiny fortress mark inside */}
      <g fill="var(--hc-primary)" opacity="0.9">
        <path
          d="M120 150h6v-3h4v3h6v4h-16z M122 154h4v14h-4z M128 154h4v14h-4z M122 168h12v4h-12z"
          transform="scale(1.4) translate(-36 -28)"
        />
      </g>
      <text
        x="94"
        y="222"
        className="hc-diagram-label"
        fill="var(--hc-muted)"
        style={{ fontSize: 8 }}
      >
        synthetic data only
      </text>

      {/* runner resource caps */}
      <text x="222" y="128" className="hc-diagram-label" fill="var(--hc-subtle)">
        GET only · ≤8 req
      </text>
      <text x="222" y="142" className="hc-diagram-label" fill="var(--hc-subtle)">
        ≤30s · no secrets
      </text>

      {/* allowed inner request */}
      <path d="M240 170h-24" stroke="var(--hc-cyan)" strokeWidth="1.5" />
      <path d="m222 166-8 4 8 4" fill="none" stroke="var(--hc-cyan)" strokeWidth="1.5" />

      {/* denied egress — coral vector stopped at the runner wall */}
      <path d="M310 170h84" stroke="var(--hc-coral)" strokeWidth="1.5" strokeDasharray="5 4" />
      <path d="m404 166 8 4-8 4" fill="none" stroke="var(--hc-coral)" strokeWidth="1.5" />
      <g stroke="var(--hc-coral)" strokeWidth="2">
        <path d="m300 160 12 12M312 160l-12 12" />
      </g>
      <text x="318" y="196" className="hc-diagram-label" fill="var(--hc-coral)">
        egress denied
      </text>

      {/* outbound rule note */}
      <text x="48" y="264" className="hc-diagram-label" fill="var(--hc-subtle)">
        sandbox.action_blocked is recorded as evidence
      </text>
    </svg>
  );
}

/**
 * Three-stage proof chain: model hypothesis (violet) → sandbox
 * execution (cyan) → oracle verdict (mint). Stepped connectors echo
 * the pixel geometry.
 */
export function ProofChainDiagram({ width = 440, className, style }: ArtProps) {
  const node = (
    x: number,
    color: string,
    deep: string,
    title: string,
    sub: string,
    glyph: "chip" | "term" | "shield",
  ) => (
    <g>
      <rect
        x={x}
        y="30"
        width="104"
        height="64"
        rx="6"
        fill="var(--hc-surface-1)"
        stroke={deep}
        strokeWidth="1.5"
      />
      <rect x={x} y="30" width="104" height="3" fill={color} />
      {glyph === "chip" ? (
        <g stroke={color} strokeWidth="1.5" fill="none">
          <rect x={x + 14} y="46" width="16" height="16" />
          <path d={`M${x + 18} 42v4M${x + 26} 42v4M${x + 18} 62v4M${x + 26} 62v4`} />
        </g>
      ) : glyph === "term" ? (
        <g stroke={color} strokeWidth="1.5" fill="none">
          <rect x={x + 12} y="44" width="20" height="20" />
          <path d={`m${x + 17} 50 3 3-3 3M${x + 22} 58h5`} />
        </g>
      ) : (
        <g stroke={color} strokeWidth="1.5" fill="none">
          <path d={`M${x + 22} 44l-7 3v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9v-6z`} />
          <path d={`m${x + 19} 53 2.2 2.2 4-4.4`} />
        </g>
      )}
      <text x={x + 40} y="56" className="hc-diagram-label" fill={color}>
        {title}
      </text>
      <text
        x={x + 40}
        y="70"
        className="hc-diagram-label"
        fill="var(--hc-subtle)"
        style={{ fontSize: 8 }}
      >
        {sub}
      </text>
    </g>
  );

  return (
    <svg
      viewBox="0 0 440 130"
      width={width}
      className={cx("hc-diagram", className)}
      style={style}
      role="img"
      aria-label="Proof chain: model hypothesis, sandbox execution, independent oracle verdict"
    >
      {node(8, "var(--hc-violet)", "var(--hc-violet-deep)", "Hypothesis", "model proposes", "chip")}
      {node(168, "var(--hc-cyan)", "var(--hc-cyan-deep)", "Execution", "sandbox runs", "term")}
      {node(
        328,
        "var(--hc-primary)",
        "var(--hc-primary-deep)",
        "Verdict",
        "oracle decides",
        "shield",
      )}
      {/* stepped connectors */}
      <path d="M112 62h20v-8h16" fill="none" stroke="var(--hc-line-strong)" strokeWidth="1.5" />
      <path
        d="m148 50 8 4-8 4"
        fill="none"
        stroke="var(--hc-line-strong)"
        strokeWidth="1.5"
        transform="translate(0 8)"
      />
      <path d="M272 62h20v-8h16" fill="none" stroke="var(--hc-line-strong)" strokeWidth="1.5" />
      <path
        d="m308 50 8 4-8 4"
        fill="none"
        stroke="var(--hc-line-strong)"
        strokeWidth="1.5"
        transform="translate(0 8)"
      />
      <text x="8" y="118" className="hc-diagram-label" fill="var(--hc-subtle)">
        model output is untrusted — only policy-validated plans execute
      </text>
    </svg>
  );
}

/** Quiet watchtower outline with a slow beacon — empty-state art. */
export function WatchtowerArt({ width = 160, className, style }: ArtProps) {
  return (
    <svg
      viewBox="0 0 160 120"
      width={width}
      className={cx("hc-diagram", className)}
      style={style}
      aria-hidden="true"
    >
      <g fill="none" stroke="var(--hc-line-strong)" strokeWidth="2">
        {/* crenellated crown */}
        <path d="M56 40h8v-8h8v8h16v-8h8v8h8v10H56z" />
        {/* tower body */}
        <path d="M60 50v46M100 50v46" />
        <path d="M60 70h40M60 84h40" />
        {/* keyhole slit */}
        <path d="M78 62h4v8h-4z" />
        {/* base */}
        <path d="M48 96h64M40 104h80" />
      </g>
      {/* beacon */}
      <circle cx="80" cy="24" r="4" fill="var(--hc-primary)" className="hc-pulse-dot--live" />
      <path
        d="M80 12v4M80 32v4M68 24h4M88 24h4"
        stroke="var(--hc-primary)"
        strokeWidth="1.5"
        opacity="0.6"
      />
      {/* ground pixels */}
      <g fill="var(--hc-surface-3)">
        <rect x="20" y="108" width="8" height="4" />
        <rect x="52" y="108" width="8" height="4" />
        <rect x="96" y="108" width="8" height="4" />
        <rect x="128" y="108" width="8" height="4" />
      </g>
    </svg>
  );
}

/**
 * Hero art — "perimeter under test". Stepped fortress inside a cyan
 * defensive perimeter; a violet model scan traces the wall while a
 * coral probe is stopped at the boundary. Original composition.
 */
export function PerimeterArt({ width = 520, className, style }: ArtProps) {
  return (
    <svg
      viewBox="0 0 520 380"
      width={width}
      className={cx("hc-diagram", className)}
      style={style}
      role="img"
      aria-label="Illustration: a pixel fortress inside a glowing defensive perimeter, a violet scan trace and a coral probe blocked at the boundary"
    >
      {/* faint coordinate grid */}
      <g stroke="var(--hc-surface-2)" strokeWidth="1">
        {Array.from({ length: 9 }, (_, i) => (
          <path key={`v${i}`} d={`M${40 + i * 55} 20V360`} />
        ))}
        {Array.from({ length: 7 }, (_, i) => (
          <path key={`h${i}`} d={`M20 ${40 + i * 50}H500`} />
        ))}
      </g>

      {/* cyan defensive perimeter */}
      <rect
        x="60"
        y="50"
        width="400"
        height="280"
        rx="8"
        fill="none"
        stroke="var(--hc-cyan)"
        strokeWidth="2"
        strokeDasharray="10 6"
        opacity="0.9"
      />
      {/* packet dots travelling the perimeter */}
      <g fill="var(--hc-cyan)">
        <rect x="120" y="48" width="6" height="6" />
        <rect x="300" y="48" width="6" height="6" />
        <rect x="456" y="150" width="6" height="6" />
        <rect x="456" y="270" width="6" height="6" />
        <rect x="58" y="210" width="6" height="6" />
      </g>

      {/* fortress — stepped silhouette built from blocks */}
      <g fill="var(--hc-surface-2)" stroke="var(--hc-line-strong)" strokeWidth="1.5">
        {/* left tower */}
        <path d="M140 300V150h16v-14h16v14h16v-14h16v14h16v150z" />
        {/* right tower */}
        <path d="M320 300V130h16v-14h16v14h16v-14h16v14h16v170z" />
        {/* curtain wall */}
        <path d="M220 300V190h100v110z" />
      </g>
      {/* wall highlights */}
      <g fill="var(--hc-surface-3)">
        <rect x="148" y="160" width="20" height="12" />
        <rect x="336" y="140" width="20" height="12" />
        <rect x="228" y="200" width="84" height="10" />
      </g>
      {/* keyhole gateway — negative space */}
      <path d="M254 300v-44a16 14 0 0 1 16 0v44z" fill="var(--hc-bg)" />
      <rect x="265" y="272" width="4" height="18" fill="var(--hc-surface-2)" />
      {/* lit seam — the vulnerable spot */}
      <rect x="220" y="236" width="10" height="10" fill="var(--hc-orange)" />
      {/* battlements top accents */}
      <g fill="var(--hc-surface-3)">
        <rect x="156" y="128" width="16" height="8" />
        <rect x="336" y="108" width="16" height="8" />
        <rect x="368" y="108" width="16" height="8" />
      </g>

      {/* violet hypothesis trace sweeping the wall */}
      <path
        d="M470 90 340 128l-40 4"
        fill="none"
        stroke="var(--hc-violet)"
        strokeWidth="1.5"
        strokeDasharray="4 5"
      />
      <circle cx="300" cy="132" r="5" fill="none" stroke="var(--hc-violet)" strokeWidth="1.5" />
      <circle
        cx="300"
        cy="132"
        r="10"
        fill="none"
        stroke="var(--hc-violet)"
        strokeWidth="1"
        opacity="0.5"
      />
      <text x="392" y="80" className="hc-diagram-label" fill="var(--hc-violet)">
        model trace
      </text>

      {/* coral probe blocked at the perimeter */}
      <path
        d="M500 300 462 286"
        fill="none"
        stroke="var(--hc-coral)"
        strokeWidth="2"
        strokeDasharray="6 4"
      />
      <g stroke="var(--hc-coral)" strokeWidth="2">
        <path d="m452 278 10 10M462 278l-10 10" />
      </g>
      <text x="410" y="318" className="hc-diagram-label" fill="var(--hc-coral)">
        blocked probe
      </text>

      {/* allowed inner flow */}
      <path d="M240 340h60v-16" fill="none" stroke="var(--hc-primary)" strokeWidth="1.5" />
      <path d="m296 330 4-8 4 8" fill="none" stroke="var(--hc-primary)" strokeWidth="1.5" />
      <text x="60" y="356" className="hc-diagram-label" fill="var(--hc-subtle)">
        perimeter under authorized test · synthetic lab
      </text>
    </svg>
  );
}
