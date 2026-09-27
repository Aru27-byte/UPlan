import type { AnalysisStatus } from "@/modules/analysis";

import type { PhaseKey, PhaseView, ReviewState } from "./phases";

// TechDesign/decision-overview.md, "Step states" (F18 R1–R3), revised for F21. Pure: the stage rail's
// states are derived from the decision's own records and stored nowhere. Nothing here returns a state
// named done, complete, clear, safe, or approved (R2, P2): a review is the planner's own record, and a
// published version is a fact about a document.

export type StepKey = "overview" | PhaseKey | "report";

export type StepState =
  | { step: PhaseKey; state: ReviewState }
  | { step: "overview"; state: "recorded" | "needs-attention" }
  | { step: "report"; state: "not-ready" | "ready" | "generating" | "published"; latestVersion: number | null };

export type WorkflowFacts = {
  phases: PhaseView[];
  status: AnalysisStatus;
  unresolvedDisagreements: number; // F19
  decisionStatus: "in_progress" | "finishing" | "report_released";
  latestVersion: number | null; // F22
};

export function isReviewed(view: PhaseView): boolean {
  return view.state.kind === "reviewed";
}

export function deriveSteps(facts: WorkflowFacts): StepState[] {
  const allReviewed = facts.phases.every(isReviewed) && facts.status.kind === "current";
  const report: StepState =
    facts.decisionStatus === "finishing"
      ? { step: "report", state: "generating", latestVersion: facts.latestVersion }
      : facts.decisionStatus === "report_released"
        ? { step: "report", state: "published", latestVersion: facts.latestVersion }
        : { step: "report", state: allReviewed ? "ready" : "not-ready", latestVersion: facts.latestVersion };

  return [
    // A vesting rule set with no filing date blocks the analysis, and the Overview is where it is recorded.
    { step: "overview", state: facts.status.kind === "blocked" ? "needs-attention" : "recorded" },
    ...facts.phases.map((view): StepState => ({ step: view.phase, state: view.state })),
    report,
  ];
}
