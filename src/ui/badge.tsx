import type { ReactNode } from "react";

// The small chip used for confidence, map status, and screening flags (`.badge` in globals.css). Tone only
// changes the fill; case is always preserved exactly as passed in (a confidence label reads "High", not
// "HIGH" — see .eyebrow in globals.css for the uppercase kind).
export type BadgeTone = "high" | "moderate" | "low" | "regulatory" | "approximate" | "neutral";

const TONE_CLASSES: Record<BadgeTone, string> = {
  high: "badge",
  moderate: "badge",
  low: "badge",
  neutral: "badge",
  // These two match the map's boundary-status colors, so a boundary's map status reads as the same color on
  // the map and in every card that cites it (map-workspace.md R2). White text on both passes 4.5:1.
  regulatory: "badge border-transparent bg-status-regulatory text-white",
  approximate: "badge border-transparent bg-status-approximate text-white",
};

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={TONE_CLASSES[tone]}>{children}</span>;
}
