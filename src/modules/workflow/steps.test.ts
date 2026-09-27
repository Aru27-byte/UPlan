import { describe, expect, it } from "vitest";

import { PHASE_KEYS } from "@/modules/reports";

import { summarizeChanges } from "./changes";
import { deriveNextActions } from "./next-actions";
import { PHASES, type PhaseView, type ReviewState } from "./phases";
import { deriveSteps, type WorkflowFacts } from "./steps";

// TechDesign/decision-overview.md and research-changes.md — pure logic, no database.

const output = (phase: PhaseView["phase"]) => ({ phase, contentSha256: `${phase}`.padEnd(64, "0"), headline: "h", lines: [], inputs: [] });
const review = (phase: PhaseView["phase"]) => ({
  id: phase, phase, contentSha256: `${phase}`.padEnd(64, "0"), verdict: "reviewed" as const, note: null,
  summary: { templateVersion: 1, headline: "h", lines: [] }, reviewedByName: "Pat", reviewedAt: new Date(),
});
const view = (phase: PhaseView["phase"], state: ReviewState): PhaseView => ({
  phase, output: state.kind === "to-do" || state.kind === "updating" ? null : output(phase), state, history: [], changes: null,
});

function facts(states: Partial<Record<PhaseView["phase"], ReviewState>> = {}, overrides: Partial<WorkflowFacts> = {}): WorkflowFacts {
  return {
    phases: PHASES.map((p) => view(p, states[p] ?? { kind: "needs-review", changedSince: null })),
    status: { kind: "current", runId: "r" },
    unresolvedDisagreements: 0,
    decisionStatus: "in_progress",
    latestVersion: null,
    ...overrides,
  };
}
const allReviewed = () => Object.fromEntries(PHASES.map((p) => [p, { kind: "reviewed", review: review(p) } as const]));

describe("reports' phase list matches workflow's", () => {
  it("PHASE_KEYS equals PHASES, so reports need not import workflow", () => {
    expect([...PHASE_KEYS]).toEqual([...PHASES]);
  });
});

describe("F18 R1/R2: step states are derived and never say done, complete, clear, safe, or approved", () => {
  it("R1: the rail is Overview, the six phases, then Report", () => {
    expect(deriveSteps(facts()).map((s) => s.step)).toEqual(["overview", ...PHASES, "report"]);
  });

  it("R2: the Overview needs attention only when the analysis is blocked (a missing filing date)", () => {
    expect(deriveSteps(facts({}, { status: { kind: "blocked", reason: "no filing date" } }))[0]).toEqual({ step: "overview", state: "needs-attention" });
    expect(deriveSteps(facts())[0]).toEqual({ step: "overview", state: "recorded" });
  });

  it("R2: Report is not ready, ready, generating, or published — by the reviews and the decision's status", () => {
    const report = (f: WorkflowFacts) => deriveSteps(f).at(-1);
    expect(report(facts())).toMatchObject({ state: "not-ready" });
    expect(report(facts(allReviewed()))).toMatchObject({ state: "ready" });
    expect(report(facts(allReviewed(), { status: { kind: "out-of-date", changes: [] } }))).toMatchObject({ state: "not-ready" });
    expect(report(facts(allReviewed(), { decisionStatus: "finishing" }))).toMatchObject({ state: "generating" });
    expect(report(facts(allReviewed(), { decisionStatus: "report_released", latestVersion: 3 }))).toEqual({ step: "report", state: "published", latestVersion: 3 });
  });

  it("R2: no state name means approval, completion, or clearance", () => {
    const words = new Set<string>();
    for (const f of [facts(), facts(allReviewed()), facts({}, { decisionStatus: "finishing" }), facts({ site: { kind: "to-do", reason: "no-study-area" } })]) {
      for (const s of deriveSteps(f)) words.add(typeof s.state === "string" ? s.state : s.state.kind);
    }
    for (const word of words) expect(word).not.toMatch(/done|complete|clear|safe|approv/i);
  });
});

describe("F18 R6: next actions come from a fixed, ordered rule table and name a step", () => {
  const first = (f: WorkflowFacts) => deriveNextActions(f)[0]?.key;

  it("R6: the priority order", () => {
    expect(first(facts({ site: { kind: "to-do", reason: "no-study-area" } }))).toBe("draw-study-area");
    expect(first(facts({}, { status: { kind: "blocked", reason: "x" } }))).toBe("record-filing-date");
    expect(first(facts({}, { status: { kind: "failed", runId: "r", errorDetail: "x" } }))).toBe("review-failed-analysis");
    expect(first(facts({}, { status: { kind: "running", runId: "r" } }))).toBe("wait-for-analysis");
    expect(first(facts())).toBe("review-site");
    expect(first(facts({ site: { kind: "reviewed", review: review("site") } }))).toBe("review-evidence");
    expect(first(facts(allReviewed()))).toBe("finish-research");
    expect(first(facts(allReviewed(), { decisionStatus: "report_released", latestVersion: 1 }))).toBe("start-research-change");
    expect(first(facts(allReviewed(), { decisionStatus: "finishing" }))).toBe("finish-generating");
  });

  it("R6: unresolved disagreements are a counted action after the evidence review, and no action is free text", () => {
    const f = facts({ site: { kind: "reviewed", review: review("site") }, evidence: { kind: "reviewed", review: review("evidence") } }, { unresolvedDisagreements: 2 });
    expect(deriveNextActions(f)).toContainEqual({ step: "evidence", key: "review-disagreements", count: 2 });
    for (const action of deriveNextActions(facts())) expect(Object.keys(action).sort()).toEqual(expect.arrayContaining(["key", "step"]));
  });

  it("R6: a footprint is asked for once the site exists and none is traced", () => {
    const f = facts({ footprint: { kind: "to-do", reason: "no-footprint" }, impact: { kind: "to-do", reason: "no-footprint" } });
    expect(deriveNextActions(f).map((a) => a.key)).toContain("trace-footprint");
  });

  it("R6: no action key names a verdict about the development", () => {
    const keys = ["finish-generating", "draw-study-area", "record-filing-date", "review-failed-analysis", "wait-for-analysis", "review-site", "review-evidence", "review-disagreements", "review-screening", "review-studies", "trace-footprint", "review-footprint", "review-impact", "finish-research", "start-research-change"];
    for (const key of keys) expect(key).not.toMatch(/approve|deny|condition|clear|safe/i);
  });
});

describe("F22 R5: summarizing what a research change changed", () => {
  const details = { title: "T", applicationType: "subdivision" as const, permitNumber: null, parcelOrAddress: null, applicant: null, projectManager: null, targetDecisionOn: null, applicationFiledOn: null, usesSampleData: false };
  const base = {
    versionNumber: 1,
    snapshot: {
      templateVersion: 2, details, runId: "22222222-2222-4222-8222-222222222222", profileVersionId: "33333333-3333-4333-8333-333333333333",
      phases: PHASES.map((p) => ({ phase: p, contentSha256: `${p}`.padEnd(64, "0"), verdict: "reviewed" as const, note: null, reviewedAt: "2026-09-27T20:00:00.000Z", reviewedByName: "Pat", changed: true, summary: { templateVersion: 1, headline: "h", lines: [] } })),
      resolutions: [], previousVersion: null, detailsChanged: false,
    },
  };

  it("R5: nothing changed means every fingerprint is the base's and the details match", () => {
    const summary = summarizeChanges(PHASES.map((p) => view(p, { kind: "reviewed", review: review(p) })), base, details);
    expect(summary.hasChanges).toBe(false);
    expect(summary.phases.every((p) => !p.changed && p.reviewedAtCurrentOutput)).toBe(true);
  });

  it("R5: a different fingerprint, or an absent output, is a changed phase; unchanged phases keep their review", () => {
    const views = PHASES.map((p) =>
      p === "impact" ? { ...view(p, { kind: "needs-review", changedSince: null }), output: { ...output(p), contentSha256: "f".repeat(64) } }
      : p === "evidence" ? view(p, { kind: "updating", status: { kind: "running", runId: "r" } })
      : view(p, { kind: "reviewed", review: review(p) }),
    );
    const summary = summarizeChanges(views, base, details);
    expect(summary.phases.filter((p) => p.changed).map((p) => p.phase)).toEqual(["evidence", "impact"]);
    expect(summary.hasChanges).toBe(true);
  });

  it("R5: a changed project detail alone is a change", () => {
    const views = PHASES.map((p) => view(p, { kind: "reviewed", review: review(p) }));
    expect(summarizeChanges(views, base, { ...details, applicant: "New applicant" })).toMatchObject({ detailsChanged: true, hasChanges: true });
    expect(summarizeChanges(views, base, { ...details, usesSampleData: true }).detailsChanged).toBe(true);
  });
});
