import { cx } from "../cx.js";

/**
 * Fortress mark — ORIGINAL 12x12 pixel grid.
 *
 * Two crenellated watchtowers joined by a curtain wall read as a
 * blocky "H"; the enclosed negative space in the wall forms a
 * keyhole gateway (arch head + narrow stem). Authored for HighCastle —
 * not derived from any third-party pixel art or mascot.
 *
 *   ##.##..##.##
 *   #####..#####
 *   #####..#####
 *   #####..#####
 *   ############
 *   ####....####
 *   ####....####
 *   #####..#####
 *   #####..#####
 *   ############
 *   #####..#####
 *   #####..#####
 */
export const FORTRESS_GRID: readonly string[] = [
  "##.##..##.##",
  "#####..#####",
  "#####..#####",
  "#####..#####",
  "############",
  "####....####",
  "####....####",
  "#####..#####",
  "#####..#####",
  "############",
  "#####..#####",
  "#####..#####",
];

export const FORTRESS_GRID_SIZE = 12;

/** Converts the grid into one SVG path (one subpath per filled cell). */
export function fortressPathD(grid: readonly string[] = FORTRESS_GRID): string {
  const parts: string[] = [];
  grid.forEach((row, y) => {
    row.split("").forEach((cell, x) => {
      if (cell === "#") parts.push(`M${x} ${y}h1v1h-1z`);
    });
  });
  return parts.join("");
}

const FORTRESS_D = fortressPathD();

export interface FortressMarkProps {
  /** Pixel size of the square mark. */
  size?: number;
  /** Fill tone: a token color or the parent's currentColor. */
  tone?: "mint" | "cyan" | "violet" | "coral" | "current";
  className?: string;
  /**
   * Accessible name when the mark stands alone. Pass `label={null}`
   * (or omit and wrap in an element that already names the brand) to
   * hide it from assistive tech.
   */
  label?: string | null;
}

const TONE_COLORS: Record<NonNullable<FortressMarkProps["tone"]>, string> = {
  mint: "var(--hc-primary)",
  cyan: "var(--hc-cyan)",
  violet: "var(--hc-violet)",
  coral: "var(--hc-coral)",
  current: "currentColor",
};

export function FortressMark({
  size = 24,
  tone = "mint",
  className,
  label = "HighCastle",
}: FortressMarkProps) {
  return (
    <svg
      viewBox={`0 0 ${FORTRESS_GRID_SIZE} ${FORTRESS_GRID_SIZE}`}
      width={size}
      height={size}
      className={cx("hc-logo-mark", className)}
      fill={TONE_COLORS[tone]}
      {...(label == null
        ? { "aria-hidden": true as const, focusable: false as const }
        : { role: "img" as const, "aria-label": label })}
    >
      <path d={FORTRESS_D} />
    </svg>
  );
}

export interface FortressLogoProps extends FortressMarkProps {
  /** Render the HIGHCASTLE wordmark next to the mark. */
  withWordmark?: boolean;
}

/**
 * Brand lockup for nav headers and marketing surfaces. Wrap it in a
 * link when it should navigate (e.g. to "/" or the workspace home).
 */
export function FortressLogo({
  withWordmark = false,
  label = null,
  className,
  ...mark
}: FortressLogoProps) {
  return (
    <span className={cx("hc-logo", className)}>
      <FortressMark label={label ?? (withWordmark ? null : "HighCastle")} {...mark} />
      {withWordmark ? (
        <span className="hc-logo-word" aria-hidden={label == null ? undefined : true}>
          HighCastle
        </span>
      ) : null}
    </span>
  );
}
