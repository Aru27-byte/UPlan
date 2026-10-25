// Type-only mirror of the workflow module's public types, for client components that must not
// pull server code into their bundle. `export type` is erased at compile time, so importing this
// file adds no runtime dependency; the types themselves stay identical to the modules'.
export type {
  ChangeSummary,
  LineDiff,
  NextAction,
  NextActionKey,
  PhaseFacts,
  PhaseKey,
  PhaseOutput,
  PhaseView,
  ProjectSummary,
  SectionContent,
  SectionState,
  SectionTableFormat,
  SectionVersion,
  StepKey,
  StepState,
  Workflow,
} from "@/modules/workflow";
