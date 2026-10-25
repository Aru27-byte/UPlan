import type { AnalysisStatus } from "@/modules/analysis";

import type { PhaseKey } from "./phases";
import type { PhaseView, SectionState } from "./sections";

// TechDesign/decision-overview.md, "Step states" (F18 R1–R3), revised for F21. Pure: the stage rail's
// states are derived from the decision's own records and stored nowhere. Nothing here returns a state
// named done, complete, clear, safe, or approved (R2, P2): a section version is the planner's own record,
// and a published version is a fact about a document.

export type StepKey = "overview" | PhaseKey | "report";

export type StepState =
  | { step: PhaseKey; state: SectionState }
  | { step: "overview"; state: "recorded" | "needs-attention" }
  | { step: "report"; state: "not-ready" | "ready" | "generating" | "published"; latestVersion: number | null };

export type WorkflowFacts = {
  phases: PhaseView[];
  status: AnalysisStatus;
  unresolvedDisagreements: number; // F19
  decisionStatus: "in_progress" | "finishing" | "report_released";
  latestVersion: number | null; // F22
};

export function isReady(view: PhaseView): boolean {
  return view.state.kind === "ready";
}

/** Every phase's section is Ready and the analysis behind it is current (research-phases.md R5). */
export function allReady(facts: WorkflowFacts): boolean {
  return facts.phases.every(isReady) && facts.status.kind === "current";
}

export function deriveSteps(facts: WorkflowFacts): StepState[] {
  const report: StepState =
    facts.decisionStatus === "finishing"
      ? { step: "report", state: "generating", latestVersion: facts.latestVersion }
      : facts.decisionStatus === "report_released"
        ? { step: "report", state: "published", latestVersion: facts.latestVersion }
        : { step: "report", state: allReady(facts) ? "ready" : "not-ready", latestVersion: facts.latestVersion };

  return [
    // A vesting rule set with no filing date blocks the analysis, and the Overview is where it is recorded.
    { step: "overview", state: facts.status.kind === "blocked" ? "needs-attention" : "recorded" },
    ...facts.phases.map((view): StepState => ({ step: view.phase, state: view.state })),
    report,
  ];
}
