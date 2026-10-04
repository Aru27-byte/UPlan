// One color per group of the research process (research-phases.md R17): the stage rail, the report-section
// block, and the accordions all read it, so Set up, Assemble, Analyze, and Report look the same everywhere.
// Class names are written out in full because Tailwind finds them by scanning the source. Every fill holds
// ink text at 4.5:1 or better (src/ui/tokens.test.ts).
export type StepGroup = "Set up" | "Assemble" | "Analyze" | "Report";

export type GroupTone = {
  /** The group's fill: its rail segment, and the report-section card. */
  fill: string;
  /** A solid bar or edge in the group's stronger color. */
  bar: string;
  edge: string;
};

export const GROUP_TONE: Record<StepGroup, GroupTone> = {
  "Set up": { fill: "bg-card-blue", bar: "bg-info", edge: "border-info" },
  Assemble: { fill: "bg-card-green", bar: "bg-ok", edge: "border-ok" },
  Analyze: { fill: "bg-card-yellow", bar: "bg-warn", edge: "border-warn" },
  Report: { fill: "bg-card-tan", bar: "bg-accent-gold-deep", edge: "border-accent-gold-deep" },
};
