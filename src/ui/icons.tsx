import type { ReactNode } from "react";

// Small inline icons for the signed-in app: 16px, drawn with a 1.75 stroke in currentColor, and always
// aria-hidden — the words beside them carry the meaning (WCAG 1.4.1: status is never color alone).
export type IconName =
  | "circle"
  | "dot"
  | "check"
  | "alert"
  | "clock"
  | "x"
  | "document"
  | "dashboard"
  | "city"
  | "help"
  | "plus"
  | "menu"
  | "arrow-right"
  | "download"
  | "gear"
  | "search"
  | "chevron-down"
  | "close"
  | "link"
  | "spreadsheet"
  | "pencil"
  | "trash"
  | "refresh";

const PATHS: Record<IconName, ReactNode> = {
  circle: <circle cx="8" cy="8" r="5.25" />,
  dot: (
    <>
      <circle cx="8" cy="8" r="5.25" />
      <circle cx="8" cy="8" r="1.75" fill="currentColor" stroke="none" />
    </>
  ),
  check: (
    <>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M5.5 8.25 7.25 10 10.5 6.25" />
    </>
  ),
  alert: (
    <>
      <path d="M8 2.5 14 13H2L8 2.5Z" />
      <path d="M8 6.75v3" />
      <path d="M8 11.5v.01" />
    </>
  ),
  clock: (
    <>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M8 4.75V8l2.25 1.25" />
    </>
  ),
  x: (
    <>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M5.75 5.75 10.25 10.25M10.25 5.75 5.75 10.25" />
    </>
  ),
  document: (
    <>
      <path d="M4 2.25h5.25L12 5v8.75H4V2.25Z" />
      <path d="M9 2.25V5h3M6 8h4M6 10.5h4" />
    </>
  ),
  dashboard: (
    <>
      <rect x="2.25" y="2.25" width="4.5" height="5.5" rx="1" />
      <rect x="9.25" y="2.25" width="4.5" height="3" rx="1" />
      <rect x="2.25" y="10" width="4.5" height="3.75" rx="1" />
      <rect x="9.25" y="7.5" width="4.5" height="6.25" rx="1" />
    </>
  ),
  city: (
    <>
      <path d="M2.5 13.75h11M4 13.75V6l4-2.5 4 2.5v7.75" />
      <path d="M6.5 8.5h3M6.5 11h3" />
    </>
  ),
  help: (
    <>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M6.25 6.5a1.75 1.75 0 1 1 2.6 1.5c-.6.35-.85.75-.85 1.5M8 11.5v.01" />
    </>
  ),
  plus: <path d="M8 3.5v9M3.5 8h9" />,
  menu: <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />,
  "arrow-right": <path d="M3.5 8h9M9 4.5 12.5 8 9 11.5" />,
  download: <path d="M8 2.5v7.5M4.75 7 8 10.25 11.25 7M3 13h10" />,
  gear: (
    // A toothed gear, drawn on a 24-unit grid and scaled to the 16-unit icon box; the stroke is widened to match.
    <g transform="scale(0.6667)" strokeWidth="2.6">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </g>
  ),
  search: (
    <>
      <circle cx="7" cy="7" r="4.25" />
      <path d="m10.25 10.25 3.25 3.25" />
    </>
  ),
  "chevron-down": <path d="m4 6 4 4 4-4" />,
  close: <path d="M3.75 3.75 12.25 12.25M12.25 3.75 3.75 12.25" />,
  link: (
    <>
      <path d="M6.75 9.25a2.5 2.5 0 0 0 3.5 0l2.25-2.25a2.5 2.5 0 0 0-3.5-3.5l-.75.75" />
      <path d="M9.25 6.75a2.5 2.5 0 0 0-3.5 0L3.5 9a2.5 2.5 0 0 0 3.5 3.5l.75-.75" />
    </>
  ),
  spreadsheet: (
    <>
      <rect x="2.25" y="2.75" width="11.5" height="10.5" rx="1.25" />
      <path d="M2.25 6.25h11.5M2.25 9.75h11.5M6.25 2.75v10.5" />
    </>
  ),
  pencil: <path d="m10.5 3 2.5 2.5L5.5 13H3v-2.5L10.5 3Z" />,
  trash: <path d="M3 4.5h10M6.25 4.5V3h3.5v1.5M4.5 4.5l.5 8.5h6l.5-8.5M6.75 7v3.5M9.25 7v3.5" />,
  refresh: (
    <>
      <path d="M13 8a5 5 0 0 1-8.75 3.3M3 8a5 5 0 0 1 8.75-3.3" />
      <path d="M11.75 2.5v2.25h-2.25M4.25 13.5v-2.25h2.25" />
    </>
  ),
};

export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      {PATHS[name]}
    </svg>
  );
}
