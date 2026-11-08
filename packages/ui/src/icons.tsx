import type { ReactNode, SVGProps } from "react";
import { cx } from "./cx.js";

/**
 * HighCastle icon set — original geometric glyphs on a 24x24 grid.
 * Squared terminals and stepped angles match the pixel-technical
 * Nocturne Signal language; authored in-house (no third-party icon
 * library is vendored).
 */

export type IconName =
  | "activity"
  | "alert-octagon"
  | "alert-triangle"
  | "arrow-down-left"
  | "arrow-left"
  | "arrow-right"
  | "arrow-up-right"
  | "ban"
  | "beacon"
  | "box"
  | "check"
  | "check-circle"
  | "chevron-down"
  | "chevron-left"
  | "chevron-right"
  | "chip"
  | "clock"
  | "code"
  | "copy"
  | "dot-circle"
  | "download"
  | "external-link"
  | "eye"
  | "file"
  | "flag"
  | "help-circle"
  | "image"
  | "info"
  | "keyhole"
  | "layers"
  | "lock"
  | "menu"
  | "plus"
  | "progress"
  | "refresh"
  | "search"
  | "server"
  | "settings"
  | "shield"
  | "shield-check"
  | "shield-off"
  | "spark"
  | "terminal"
  | "user"
  | "users"
  | "x"
  | "x-circle"
  | "zap";

const GLYPHS: Record<IconName, ReactNode> = {
  activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  "alert-octagon": (
    <>
      <path d="M8.5 3h7L21 8.5v7L15.5 21h-7L3 15.5v-7z" />
      <path d="M12 8v5" />
      <path d="M12 16.5h.01" />
    </>
  ),
  "alert-triangle": (
    <>
      <path d="M12 4 2.5 20h19z" />
      <path d="M12 10v4" />
      <path d="M12 17h.01" />
    </>
  ),
  "arrow-down-left": (
    <>
      <path d="M17 7 7 17" />
      <path d="M15 17H7V9" />
    </>
  ),
  "arrow-left": (
    <>
      <path d="M20 12H4" />
      <path d="m10 6-6 6 6 6" />
    </>
  ),
  "arrow-right": (
    <>
      <path d="M4 12h16" />
      <path d="m14 6 6 6-6 6" />
    </>
  ),
  "arrow-up-right": (
    <>
      <path d="M7 17 17 7" />
      <path d="M9 7h8v8" />
    </>
  ),
  ban: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="m7 7 10 10" />
    </>
  ),
  beacon: (
    <>
      <path d="M9 21 12 9l3 12" />
      <path d="M7 21h10" />
      <path d="M12 6h.01" />
      <path d="M6.5 8.5a7.8 7.8 0 0 1 11 0" />
      <path d="M4 6a11.3 11.3 0 0 1 16 0" />
    </>
  ),
  box: (
    <>
      <path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5z" />
      <path d="M4 8.5 12 13l8-4.5" />
      <path d="M12 13v7" />
    </>
  ),
  check: <path d="m4.5 12.5 5 5L19.5 7" />,
  "check-circle": (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </>
  ),
  "chevron-down": <path d="m6 9.5 6 6 6-6" />,
  "chevron-left": <path d="m14.5 6-6 6 6 6" />,
  "chevron-right": <path d="m9.5 6 6 6-6 6" />,
  chip: (
    <>
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
      <path d="M10 10.5h4v3h-4z" />
      <path d="M9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4" />
    </>
  ),
  clock: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="8" />
      <path d="M12 8v4.5l3 1.5" />
    </>
  ),
  code: (
    <>
      <path d="m8 7-5 5 5 5" />
      <path d="m16 7 5 5-5 5" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="1.5" />
      <path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5" />
    </>
  ),
  "dot-circle": (
    <>
      <rect x="4" y="4" width="16" height="16" rx="8" />
      <path d="M12 12h.01" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v10" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
      <path d="M4 19h16" />
    </>
  ),
  "external-link": (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 13.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5.5" />
    </>
  ),
  eye: (
    <>
      <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" />
      <path d="M12 12h.01" />
    </>
  ),
  file: (
    <>
      <path d="M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14 3v5h5" />
    </>
  ),
  flag: (
    <>
      <path d="M6 21V4" />
      <path d="M6 5h12l-3 4 3 4H6" />
    </>
  ),
  "help-circle": (
    <>
      <rect x="4" y="4" width="16" height="16" rx="8" />
      <path d="M9.5 9.5A2.5 2.5 0 0 1 12 8a2.5 2.5 0 0 1 2.5 2.5c0 1.5-2.5 2-2.5 3.5" />
      <path d="M12 17h.01" />
    </>
  ),
  image: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="1.5" />
      <path d="m4 15 4.5-4.5 3.5 3.5 3-3L20 16" />
      <path d="M9.5 9h.01" />
    </>
  ),
  info: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="8" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </>
  ),
  keyhole: (
    <>
      <path d="M12 3a5 5 0 0 1 5 5c0 2-1 3.6-2.4 4.5L16 21H8l1.4-8.5A5 5 0 0 1 12 3z" />
      <path d="M12 9.5v3" />
    </>
  ),
  layers: (
    <>
      <rect x="5" y="5" width="14" height="14" rx="2" />
      <rect x="8" y="8" width="8" height="8" rx="1" />
      <path d="M12 12h.01" />
    </>
  ),
  lock: (
    <>
      <rect x="6" y="11" width="12" height="9" rx="1.5" />
      <path d="M9 11V8a3 3 0 0 1 6 0v3" />
      <path d="M12 14.5v2" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  plus: <path d="M12 5v14M5 12h14" />,
  progress: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="8" />
      <path d="M12 12V6" />
      <path d="M12 12h5.5" fill="currentColor" stroke="none" opacity="0.35" />
      <path d="M12 12h.01" />
    </>
  ),
  refresh: (
    <>
      <path d="M19 12a7 7 0 1 1-2-4.9" />
      <path d="M19 3v5h-5" />
    </>
  ),
  search: (
    <>
      <rect x="4" y="4" width="12" height="12" rx="6" />
      <path d="m14.5 14.5 5.5 5.5" />
    </>
  ),
  server: (
    <>
      <rect x="4" y="4" width="16" height="7" rx="1.5" />
      <rect x="4" y="13" width="16" height="7" rx="1.5" />
      <path d="M8 7.5h.01M8 16.5h.01" />
    </>
  ),
  settings: (
    <>
      <rect x="8.5" y="8.5" width="7" height="7" rx="3.5" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.7 5.7l2.1 2.1M16.2 16.2l2.1 2.1M18.3 5.7l-2.1 2.1M7.8 16.2l-2.1 2.1" />
    </>
  ),
  shield: <path d="M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6z" />,
  "shield-check": (
    <>
      <path d="M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </>
  ),
  "shield-off": (
    <>
      <path d="M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6z" />
      <path d="m9 9.5 6 6" />
      <path d="m15 9.5-6 6" />
    </>
  ),
  spark: (
    <>
      <path d="M12 3v5M12 16v5M3 12h5M16 12h5" />
      <path d="M12 12h.01" />
    </>
  ),
  terminal: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="1.5" />
      <path d="m7 10 3 3-3 3" />
      <path d="M13 16h4" />
    </>
  ),
  user: (
    <>
      <rect x="9" y="4" width="6" height="6" rx="3" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  users: (
    <>
      <rect x="9" y="4" width="6" height="6" rx="3" />
      <path d="M4 20a8 8 0 0 1 16 0" />
      <path d="M17.5 5.5a3 3 0 0 1 0 4" />
    </>
  ),
  x: <path d="m6 6 12 12M18 6 6 18" />,
  "x-circle": (
    <>
      <rect x="4" y="4" width="16" height="16" rx="8" />
      <path d="m9.5 9.5 5 5M14.5 9.5l-5 5" />
    </>
  ),
  zap: <path d="M13 3 5 13.5h5L10 21l8-10.5h-5z" />,
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  /** Pixel size; defaults to 16 (metadata scale). Use 20–24 for actions. */
  size?: number;
}

/**
 * Decorative by default (aria-hidden). Pass an explicit `aria-label`
 * when the icon itself carries meaning and no adjacent text exists.
 */
export function Icon({ name, size = 16, className, ...rest }: IconProps) {
  const labelled = rest["aria-label"] != null || rest["aria-labelledby"] != null;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx("hc-icon", className)}
      {...(labelled
        ? { role: "img" as const }
        : { "aria-hidden": true as const, focusable: false as const })}
      {...rest}
    >
      {GLYPHS[name]}
    </svg>
  );
}

export const ICON_NAMES = Object.keys(GLYPHS) as IconName[];
