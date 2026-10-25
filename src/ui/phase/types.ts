import type { ActionState } from "../action-state";
import type { StatusTone } from "../status-label";

import type { AssistCardModel } from "./assist-types";
import type { StepGroup } from "./group-tones";

// The plain shapes a phase page renders (TechDesign/research-phases.md, "Pages"). The route builds them
// from workflow's PhaseView and formats every date and label there, because src/ui imports no runtime
// code from @/modules — these components receive strings, booleans, and bound Server Functions.

export type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/** R5: a section is in exactly one of these states, and none of them is a verdict. */
export type SectionStateKind = "to-do" | "updating" | "ready" | "out-of-date";

export type PhaseViewModel = {
  phase: string;
  title: string;
  group: StepGroup;
  state: { kind: SectionStateKind; text: string; tone: StatusTone };
  emptyReason: string | null;
  inputs: { label: string; value: string }[];
  /** Where each input is changed (R9). */
  changeLinks: { label: string; href: string }[];
  /** True when the project's research is not open (completed or generating). */
  readOnly: boolean;
  readOnlyReason: string | null;
};

export type SectionVersionModel = {
  id: string;
  versionNumber: number;
  sourceText: string;
  instruction: string | null;
  by: string;
  at: string;
  /** True when this version is the content the section shows now. */
  current: boolean;
  /** True when this version was built on the current analysis. */
  currentAnalysis: boolean;
  /** R10: the sentences this version added and removed against the one before it. */
  changes: { added: string[]; removed: string[] } | null;
};

/** The section panel: the report section on the left, its chat and history on the right. */
export type ReportSectionModel = {
  step: string;
  group: StepGroup;
  stepTitle: string;
  /** The phase's section state, or null for the Overview, which is not a research phase. */
  state: { kind: SectionStateKind; text: string; tone: StatusTone } | null;
  emptyReason: string | null;
  versions: SectionVersionModel[];
  changes: { added: string[]; removed: string[] } | null;
  /** The current analysis draft, shown behind Update to current analysis when the section is stale. */
  draft: { headline: string; lines: string[] } | null;
  /** R7: what the page carried, so a change is refused if either moved. */
  contentSha256: string | null;
  outputSha256: string | null;
  readOnly: boolean;
  readOnlyReason: string | null;
  /** True when the section shows a stored version that the current analysis has moved past. */
  staleVersion: boolean;
  /** True when a phase has a current analysis to build a section on. */
  editable: boolean;
  revertAction?: Action;
  updateAction?: Action;
};

export type SectionPrompt = { assistId: string; label: string; text: string };

export type SectionChatModel = {
  phase: string;
  configured: boolean;
  notConfigured: string;
  prompts: SectionPrompt[];
  messages: AssistCardModel[];
  explainAction: Action;
  changeAction: Action;
  respondAction: Action;
  contentSha256: string;
  outputSha256: string;
  timeZone: string;
};
