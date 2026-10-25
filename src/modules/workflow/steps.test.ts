import { describe, expect, it } from "vitest";

import { PHASE_KEYS, type SectionContent } from "@/modules/reports";

import { summarizeChanges } from "./changes";
import { deriveNextActions } from "./next-actions";
import { PHASES, type PhaseKey, type PhaseOutput } from "./phases";
import { contentSha256, type PhaseView, type SectionState, type SectionVersion } from "./sections";
import { deriveSteps, type WorkflowFacts } from "./steps";

// TechDesign/decision-overview.md and research-changes.md — pure logic, no database.

const content = (phase: PhaseKey): SectionContent => ({ headline: `${phase} headline`, lines: [`${phase} line.`], tables: [] });
const output = (phase: PhaseKey): PhaseOutput => ({
  phase,
  contentSha256: contentSha256(content(phase)),
  headline: `${phase} headline`,
  lines: [`${phase} line.`],
  inputs: [],
});

function version(phase: PhaseKey): SectionVersion {
  const c = content(phase);
  return {
    id: `${phase}-v1`,
    phase,
    versionNumber: 1,
    source: "ai",
    content: c,
    contentSha256: contentSha256(c),
    outputSha256: output(phase).contentSha256,
    instruction: null,
    sourceVersionNumber: null,
    createdByName: "Pat",
    createdAt: new Date("2026-09-10T00:00:00Z"),
  };
}

const ready = (phase: PhaseKey): SectionState => ({ kind: "ready", content: content(phase), version: null });

function view(phase: PhaseKey, state: SectionState, overrides: Partial<PhaseView> = {}): PhaseView {
  const hasOutput = state.kind === "ready" || state.kind === "out-of-date";
  return { phase, output: hasOutput ? output(phase) : null, state, versions: state.kind === "out-of-date" ? [state.version] : [], changes: null, ...overrides };
}

function facts(states: Partial<Record<PhaseKey, SectionState>> = {}, overrides: Partial<WorkflowFacts> = {}): WorkflowFacts {
  return {
    phases: PHASES.map((p) => view(p, states[p] ?? ready(p))),
    status: { kind: "current", runId: "r" },
    unresolvedDisagreements: 0,
    decisionStatus: "in_progress",
    latestVersion: null,
    ...overrides,
  };
}

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

  it("R2: Report is not ready, ready, generating, or published — by the sections and the decision's status", () => {
    const report = (f: WorkflowFacts) => deriveSteps(f).at(-1);
    expect(report(facts({ evidence: { kind: "to-do", reason: "no-study-area", version: null } }))).toMatchObject({ state: "not-ready" });
    expect(report(facts())).toMatchObject({ state: "ready" });
    expect(report(facts({}, { status: { kind: "out-of-date", changes: [] } }))).toMatchObject({ state: "not-ready" });
    expect(report(facts({}, { decisionStatus: "finishing" }))).toMatchObject({ state: "generating" });
    expect(report(facts({}, { decisionStatus: "report_released", latestVersion: 3 }))).toEqual({ step: "report", state: "published", latestVersion: 3 });
  });

  it("R2: no state name means approval, completion, or clearance", () => {
    const words = new Set<string>();
    for (const f of [facts(), facts({}, { decisionStatus: "finishing" }), facts({ site: { kind: "to-do", reason: "no-study-area", version: null } })]) {
      for (const s of deriveSteps(f)) words.add(typeof s.state === "string" ? s.state : s.state.kind);
    }
    for (const word of words) expect(word).not.toMatch(/done|complete|clear|safe|approv/i);
  });
});

describe("F18 R6: next actions come from a fixed, ordered rule table and name a step", () => {
  const first = (f: WorkflowFacts) => deriveNextActions(f)[0]?.key;

  it("R6: the priority order", () => {
    expect(first(facts({ site: { kind: "to-do", reason: "no-study-area", version: null } }))).toBe("draw-study-area");
    expect(first(facts({}, { status: { kind: "blocked", reason: "x" } }))).toBe("record-filing-date");
    expect(first(facts({}, { status: { kind: "failed", runId: "r", errorDetail: "x" } }))).toBe("review-failed-analysis");
    expect(first(facts({}, { status: { kind: "running", runId: "r" } }))).toBe("wait-for-analysis");
    expect(first(facts())).toBe("finish-research");
    expect(first(facts({}, { decisionStatus: "report_released", latestVersion: 1 }))).toBe("start-research-change");
    expect(first(facts({}, { decisionStatus: "finishing" }))).toBe("finish-generating");
  });

  it("R6: an out-of-date section is an update action on its own step", () => {
    expect(first(facts({ site: { kind: "out-of-date", version: version("site"), reason: "analysis-not-current" } }))).toBe("update-section");
    expect(deriveNextActions(facts({ site: { kind: "out-of-date", version: version("site"), reason: "analysis-not-current" } }))[0]?.step).toBe("site");
  });

  it("R6: unresolved disagreements are a counted action, and no action is free text", () => {
    const f = facts({}, { unresolvedDisagreements: 2 });
    expect(deriveNextActions(f)).toContainEqual({ step: "evidence", key: "resolve-disagreements", count: 2 });
    for (const action of deriveNextActions(facts())) expect(Object.keys(action).sort()).toEqual(expect.arrayContaining(["key", "step"]));
  });

  it("R6: a footprint is asked for once the site exists and none is traced", () => {
    const f = facts({ footprint: { kind: "to-do", reason: "no-footprint", version: null }, impact: { kind: "to-do", reason: "no-footprint", version: null } });
    expect(deriveNextActions(f).map((a) => a.key)).toContain("trace-footprint");
  });

  it("R6: no action key names a verdict about the development", () => {
    const keys = ["finish-generating", "draw-study-area", "record-filing-date", "review-failed-analysis", "wait-for-analysis", "update-section", "resolve-disagreements", "trace-footprint", "finish-research", "start-research-change"];
    for (const key of keys) expect(key).not.toMatch(/approve|deny|condition|clear|safe/i);
  });
});

describe("F22 R5: summarizing what a research change changed", () => {
  const details = { title: "T", applicationType: "subdivision" as const, permitNumber: null, parcelOrAddress: null, applicant: null, projectManager: null, targetDecisionOn: null, applicationFiledOn: null, usesSampleData: false };
  const snapshot = {
    templateVersion: 2,
    details,
    runId: "22222222-2222-4222-8222-222222222222",
    profileVersionId: "33333333-3333-4333-8333-333333333333",
    sections: PHASES.map((p) => ({
      phase: p,
      sectionVersionNumber: 1,
      contentSha256: contentSha256(content(p)),
      outputSha256: output(p).contentSha256,
      headline: `${p} headline`,
      lines: [`${p} line.`],
      tables: [],
      changed: true,
    })),
    resolutions: [],
    previousVersion: null,
    detailsChanged: false,
  };

  it("R5: nothing changed means every content hash is the base's and the details match", () => {
    const summary = summarizeChanges(PHASES.map((p) => view(p, ready(p))), snapshot, 1, details);
    expect(summary.hasChanges).toBe(false);
    expect(summary.phases.every((p) => !p.changed && p.ready)).toBe(true);
  });

  it("R5: a different content hash, or an absent section, is a changed phase; unchanged phases stay unchanged", () => {
    const views = PHASES.map((p) =>
      p === "impact" ? view(p, { kind: "ready", content: { headline: "A new headline", lines: ["A new line."], tables: [] }, version: null })
      : p === "evidence" ? view(p, { kind: "updating", status: { kind: "running", runId: "r" }, version: null })
      : view(p, ready(p)),
    );
    const summary = summarizeChanges(views, snapshot, 1, details);
    expect(summary.phases.filter((p) => p.changed).map((p) => p.phase)).toEqual(["evidence", "impact"]);
    expect(summary.hasChanges).toBe(true);
  });

  it("R5: a changed project detail alone is a change", () => {
    const views = PHASES.map((p) => view(p, ready(p)));
    expect(summarizeChanges(views, snapshot, 1, { ...details, applicant: "New applicant" })).toMatchObject({ detailsChanged: true, hasChanges: true });
    expect(summarizeChanges(views, snapshot, 1, { ...details, usesSampleData: true }).detailsChanged).toBe(true);
  });
});
