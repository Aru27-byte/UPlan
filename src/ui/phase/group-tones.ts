// One color per group of the research process (research-phases.md R17): the stage rail, the report-section
// block, and the accordions all read it, so Set up, Assemble, Analyze, and Report look the same everywhere.
// They are the design's step-card colors: blue, lime, gold, and tan, each as a faint tint with a solid top edge
// and light text over it. Class names are written out in full because Tailwind finds them by scanning the source.
export type StepGroup = "Set up" | "Assemble" | "Analyze" | "Report";

export type GroupTone = {
  /** The group's tinted card: its rail segment and the report-section block. Light text sits on it. */
  fill: string;
  /** A solid bar in the group's color, such as an accordion's left edge or a stage number. */
  bar: string;
  /** The group's edge: a faint border all round and a solid 4px top. */
  edge: string;
  /** The group's color as text, for its caption. Every one holds 4.5:1 or better on a surface. */
  text: string;
};

export const GROUP_TONE: Record<StepGroup, GroupTone> = {
  "Set up": {
    fill: "bg-gradient-to-b from-accent-blue/[0.16] to-accent-blue/[0.03]",
    bar: "bg-accent-blue",
    edge: "border-accent-blue/45 border-t-4 border-t-accent-blue",
    text: "text-accent-blue",
  },
  Assemble: {
    fill: "bg-gradient-to-b from-accent-lime/[0.16] to-accent-lime/[0.03]",
    bar: "bg-accent-lime",
    edge: "border-accent-lime/45 border-t-4 border-t-accent-lime",
    text: "text-accent-lime",
  },
  Analyze: {
    fill: "bg-gradient-to-b from-accent-gold/[0.16] to-accent-gold/[0.03]",
    bar: "bg-accent-gold",
    edge: "border-accent-gold/45 border-t-4 border-t-accent-gold",
    text: "text-accent-gold",
  },
  Report: {
    fill: "bg-gradient-to-b from-accent-tan/[0.18] to-accent-tan/[0.03]",
    bar: "bg-accent-tan",
    edge: "border-accent-tan/50 border-t-4 border-t-accent-tan",
    text: "text-accent-tan",
  },
};
