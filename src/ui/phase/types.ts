import type { StatusTone } from "../status-label";

import type { StepGroup } from "./group-tones";

// The plain shape a phase page renders (TechDesign/research-phases.md, "Pages"). The route builds it from
// workflow's PhaseView and formats every date and label there, because src/ui imports no runtime code from
// @/modules — these components receive strings and booleans and nothing else.

export type ReviewKind = "to-do" | "updating" | "needs-review" | "reviewed" | "revision-requested";

export type HistoryEntryModel = {
  id: string;
  verdictText: string;
  tone: StatusTone;
  note: string | null;
  by: string;
  at: string;
  headline: string;
  lines: string[];
};

export type PhaseViewModel = {
  phase: string;
  title: string;
  group: StepGroup;
  state: { kind: ReviewKind; text: string; tone: StatusTone };
  /** The drafted output, or null with `emptyReason` saying exactly what is missing (R4). */
  output: { headline: string; lines: string[]; contentSha256: string } | null;
  emptyReason: string | null;
  inputs: { label: string; value: string }[];
  /** Where each input is changed (R9). */
  changeLinks: { label: string; href: string }[];
  /** R10: the sentences added and removed since the last review of an earlier output. */
  changes: { added: string[]; removed: string[]; since: string } | null;
  history: HistoryEntryModel[];
  /** True when the project's research is not open (completed or generating): no review and no editing. */
  readOnly: boolean;
  readOnlyReason: string | null;
};
