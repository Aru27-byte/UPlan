import { allReady, type StepKey, type WorkflowFacts } from "./steps";
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
  | "update-section"
  | "resolve-disagreements"
  | "trace-footprint"
  | "finish-research"
  | "start-research-change";

export type NextAction = { step: StepKey; key: NextActionKey; count?: number };

const stateOf = (f: WorkflowFacts, phase: PhaseKey) => f.phases.find((p) => p.phase === phase)?.state.kind;
// A phase needs an update while its stored section is out of date (research-phases.md R5).
const outOfDate = (f: WorkflowFacts, phase: PhaseKey) => stateOf(f, phase) === "out-of-date";

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
  { key: "update-section", step: "site", when: (f) => outOfDate(f, "site") },
  { key: "update-section", step: "evidence", when: (f) => outOfDate(f, "evidence") },
  { key: "resolve-disagreements", step: "evidence", when: (f) => f.unresolvedDisagreements },
  { key: "update-section", step: "screening", when: (f) => outOfDate(f, "screening") },
  { key: "update-section", step: "studies", when: (f) => outOfDate(f, "studies") },
  {
    key: "trace-footprint",
    step: "footprint",
    when: (f) => stateOf(f, "site") !== "to-do" && stateOf(f, "footprint") === "to-do",
  },
  { key: "update-section", step: "footprint", when: (f) => outOfDate(f, "footprint") },
  { key: "update-section", step: "impact", when: (f) => outOfDate(f, "impact") },
  {
    key: "finish-research",
    step: "report",
    when: (f) => f.decisionStatus === "in_progress" && allReady(f),
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
