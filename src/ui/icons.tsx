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
  | "chevron-down"
  | "download";

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
  "chevron-down": <path d="M4 6l4 4 4-4" />,
  download: <path d="M8 2.5v7.5M4.75 7 8 10.25 11.25 7M3 13h10" />,
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
