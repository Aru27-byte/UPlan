import type { ReactNode } from "react";

// UIDesign/*.png — the small ink-background pill used for confidence, map status, and screening
// flags. Tone only changes the background color; case is always preserved exactly as passed in
// (a confidence label reads "High", not "HIGH" — see .eyebrow in globals.css for the uppercase kind).
export type BadgeTone = "high" | "moderate" | "low" | "regulatory" | "approximate" | "neutral";

const TONE_CLASSES: Record<BadgeTone, string> = {
  high: "badge",
  moderate: "badge",
  low: "badge",
  neutral: "badge",
  // These two match src/ui/map-styles.ts exactly, so a boundary's map status reads as the same
  // color on the map and in every card that cites it (map-workspace.md R2).
  regulatory: "badge bg-status-regulatory",
  approximate: "badge bg-status-approximate",
};

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={TONE_CLASSES[tone]}>{children}</span>;
}
