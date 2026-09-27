import { isReviewed, type StepKey, type WorkflowFacts } from "./steps";
import type { PhaseKey } from "./phases";

// TechDesign/decision-overview.md, "Next actions" (F18 R6). A fixed, ordered rule table over the
// decision's records. Every action names a workflow step, never a judgment about the development: none
// proposes approving, denying, conditioning, or clearing land, and none is generated text. The array
// order is the priority order.

export type NextActionKey =
  | "finish-generating"
  | "draw-study-area"
  | "record-filing-date"
  | "review-failed-analysis"
  | "wait-for-analysis"
  | "review-site"
  | "review-evidence"
  | "review-disagreements"
  | "review-screening"
  | "review-studies"
  | "trace-footprint"
  | "review-footprint"
  | "review-impact"
  | "finish-research"
  | "start-research-change";

export type NextAction = { step: StepKey; key: NextActionKey; count?: number };

const viewOf = (f: WorkflowFacts, phase: PhaseKey) => f.phases.find((p) => p.phase === phase);
const stateOf = (f: WorkflowFacts, phase: PhaseKey) => viewOf(f, phase)?.state.kind;
// A phase needs work while its state is needs-review or revision-requested (research-phases.md R5).
const needsReview = (f: WorkflowFacts, phase: PhaseKey) => {
  const kind = stateOf(f, phase);
  return kind === "needs-review" || kind === "revision-requested";
};

const RULES: { key: NextActionKey; step: StepKey; when: (f: WorkflowFacts) => number | boolean }[] = [
  { key: "finish-generating", step: "report", when: (f) => f.decisionStatus === "finishing" },
  { key: "start-research-change", step: "report", when: (f) => f.decisionStatus === "report_released" },
  { key: "draw-study-area", step: "site", when: (f) => stateOf(f, "site") === "to-do" },
  { key: "record-filing-date", step: "overview", when: (f) => f.status.kind === "blocked" },
  { key: "review-failed-analysis", step: "overview", when: (f) => f.status.kind === "failed" },
  {
    key: "wait-for-analysis",
    step: "overview",
    when: (f) => f.status.kind === "running" || f.status.kind === "out-of-date",
  },
  { key: "review-site", step: "site", when: (f) => needsReview(f, "site") },
  { key: "review-evidence", step: "evidence", when: (f) => needsReview(f, "evidence") },
  { key: "review-disagreements", step: "evidence", when: (f) => f.unresolvedDisagreements },
  { key: "review-screening", step: "screening", when: (f) => needsReview(f, "screening") },
  { key: "review-studies", step: "studies", when: (f) => needsReview(f, "studies") },
  {
    key: "trace-footprint",
    step: "footprint",
    when: (f) => stateOf(f, "site") !== "to-do" && stateOf(f, "footprint") === "to-do",
  },
  { key: "review-footprint", step: "footprint", when: (f) => needsReview(f, "footprint") },
  { key: "review-impact", step: "impact", when: (f) => needsReview(f, "impact") },
  {
    key: "finish-research",
    step: "report",
    when: (f) => f.decisionStatus === "in_progress" && f.phases.every(isReviewed) && f.status.kind === "current",
  },
];

/** The actions that apply, in priority order. A numeric result is a count (and zero means the rule doesn't apply). */
export function deriveNextActions(facts: WorkflowFacts): NextAction[] {
  const actions: NextAction[] = [];
  for (const rule of RULES) {
    const result = rule.when(facts);
    if (result === false || result === 0) continue;
    actions.push(typeof result === "number" ? { step: rule.step, key: rule.key, count: result } : { step: rule.step, key: rule.key });
  }
  return actions;
}
