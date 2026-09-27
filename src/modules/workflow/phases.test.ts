import { describe, expect, it } from "vitest";

import type { AnalysisResults, EvidenceResolution } from "@/modules/analysis";
import { buildSampleProfileDocument, resolveRulesInForce } from "@/modules/profiles";

import { diffLines } from "./diff";
import {
  draftEvidence,
  draftFootprint,
  draftImpact,
  draftScreening,
  draftSite,
  draftStudies,
  type Draft,
  type DraftContext,
} from "./drafting";
import { PHASES, buildPhaseViews, derivePhaseOutputs, missingReason, type PhaseFacts, type PhaseReview } from "./phases";

// TechDesign/research-phases.md — pure logic, no database.

const rules = resolveRulesInForce(buildSampleProfileDocument(), "2026-09-27", null).rules;
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

/** The first element, or a failed test: tests mutate a fixture entry they know exists. */
function first<T>(items: T[]): T {
  const item = items[0];
  if (item === undefined) throw new Error("the fixture has no first entry");
  return item;
}

function results(): AnalysisResults {
  return {
    impacts: [
      { impactKey: "wetlands:a:1:feature-area-in-footprint", resourceType: "wetlands", measure: "feature-area-in-footprint", unit: "us-survey-sq-ft", min: 4210, max: 4210, dependsOn: null, approximate: false, ruleKeys: [], evidence: [{ datasetVersionId: A, sourceFeatureId: "1" }] },
    ],
    evidenceBase: {
      disagreements: [{ resourceType: "wetlands", mappedBy: A, notMappedBy: B, area: 900, unit: "us-survey-sq-ft" }],
      gaps: [{ resourceType: "critical-aquifer-recharge-areas", reason: "no-dataset-mapped" }],
    },
    screening: [
      { resourceType: "wetlands", datasetVersionId: A, intersectingFeatureCount: 1, overlapAreaSqFt: 4210, overlapLengthFt: 0, searchedWithinFt: 100, nearestDistanceFt: 0, bufferReaches: [], approximate: false },
    ],
    studyFlags: [
      { triggerKey: "wetlands-study", study: "critical-area-study", resourceType: "wetlands", nearestDistanceFt: 0, approximate: false, ruleKeys: ["wetlands-study"], evidence: [{ datasetVersionId: A, sourceFeatureId: "1" }] },
    ],
    limits: [{ key: "significant-trees-not-countable", resourceType: "forest-canopy", datasetVersionId: null }],
  };
}

function facts(overrides: Partial<PhaseFacts> = {}): PhaseFacts {
  return {
    studyArea: { revision: 1, areaAcres: 18.44, sourceNote: "Traced from sheet C2.0", createdAt: new Date("2026-09-01T00:00:00Z") },
    footprint: { revision: 1, areaAcres: 6.1, sourceNote: "Sample data — illustrative proposed footprint, not a real site plan.", createdAt: new Date("2026-09-02T00:00:00Z") },
    status: { kind: "current", runId: "run-1" },
    run: { id: "run-1", results: results(), profileVersionId: "p1", profileVersionNumber: 2, datasetVersionIds: [A, B] },
    rules,
    resolvedFor: { "critical-areas": "2026-09-27", trees: "2026-09-27" },
    datasetTitles: new Map([[A, "Wetlands (county)"], [B, "Wetlands (state)"]]),
    datasetLimitations: new Map(),
    resolutions: [],
    ...overrides,
  };
}

function resolution(overrides: Partial<EvidenceResolution> = {}): EvidenceResolution {
  return {
    decisionId: "d", resourceTypeKey: "wetlands", mappedBy: A, notMappedBy: B, revision: 1, reliedOn: "mapped_by",
    rationale: "More recent survey.", createdBy: "u", createdAt: new Date("2026-09-03T00:00:00Z"), ...overrides,
  };
}

/** The same value with every object's keys in the opposite order. */
function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, reverseKeys(v)]));
  }
  return value;
}

const hashes = (f: PhaseFacts) => Object.fromEntries(PHASES.map((p) => [p, derivePhaseOutputs(f)[p]?.contentSha256]));

describe("R4: a phase has an output only when its inputs exist and the analysis is current", () => {
  it("R4: every phase has output when everything exists", () => {
    const outputs = derivePhaseOutputs(facts());
    expect(PHASES.filter((p) => outputs[p] === undefined)).toEqual([]);
  });

  it("R4: no study area means Site, Evidence, Screening, Studies, and Impact have none", () => {
    const f = facts({ studyArea: null, status: { kind: "none", reason: "no-study-area" }, run: null, rules: null });
    expect(missingReason("site", f)).toBe("no-study-area");
    expect(missingReason("evidence", f)).toBe("no-study-area");
    expect(missingReason("impact", f)).toBe("no-study-area");
    expect(missingReason("footprint", f)).toBeNull(); // a footprint has its own output
  });

  it("R4: no footprint means Footprint and Impact have none, and Screening still does (F14 R11)", () => {
    const f = facts({ footprint: null });
    expect(missingReason("footprint", f)).toBe("no-footprint");
    expect(missingReason("impact", f)).toBe("no-footprint");
    expect(derivePhaseOutputs(f).screening).toBeDefined();
    expect(derivePhaseOutputs(f).studies).toBeDefined();
  });

  it("R4: an analysis that isn't current gives the analysis phases no output, never an old one", () => {
    const f = facts({ status: { kind: "out-of-date", changes: [] }, run: null, rules: null });
    for (const p of ["evidence", "screening", "studies", "impact"] as const) expect(missingReason(p, f)).toBe("analysis-not-current");
    expect(derivePhaseOutputs(f).site).toBeDefined();
    expect(derivePhaseOutputs(f).footprint).toBeDefined();
  });
});

describe("R7: the fingerprint changes exactly when what the output states changes", () => {
  const base = hashes(facts());

  it("R7: the same facts give the same fingerprints, and key order doesn't matter", () => {
    expect(hashes(facts())).toEqual(base);
    const reordered = facts();
    if (reordered.run) reordered.run.results = reverseKeys(reordered.run.results) as AnalysisResults;
    expect(JSON.stringify(reordered.run?.results)).not.toBe(JSON.stringify(facts().run?.results)); // really reordered
    expect(hashes(reordered)).toEqual(base);
  });

  it("R7: a new study area revision changes Site only, among the phases it alone feeds", () => {
    const changed = hashes(facts({ studyArea: { revision: 2, areaAcres: 18.44, sourceNote: "x", createdAt: new Date() } }));
    expect(changed.site).not.toBe(base.site);
    expect(changed.footprint).toBe(base.footprint);
  });

  it("R7: each measured number changes its own phase's fingerprint, and no other's", () => {
    const impact = facts();
    if (impact.run) first(impact.run.results.impacts).min = 4211;
    const h = hashes(impact);
    expect(h.impact).not.toBe(base.impact);
    expect(h.screening).toBe(base.screening);
    expect(h.evidence).toBe(base.evidence);

    const screening = facts();
    if (screening.run) first(screening.run.results.screening).overlapAreaSqFt = 4211;
    expect(hashes(screening).screening).not.toBe(base.screening);
    expect(hashes(screening).impact).toBe(base.impact);

    const flag = facts();
    if (flag.run) first(flag.run.results.studyFlags).nearestDistanceFt = 5;
    expect(hashes(flag).studies).not.toBe(base.studies);

    const gap = facts();
    if (gap.run) first(gap.run.results.evidenceBase.disagreements).area = 901;
    expect(hashes(gap).evidence).not.toBe(base.evidence);
  });

  it("R7: a wording change alone can't change a fingerprint: it hashes measurements, not sentences", () => {
    const renamed = facts({ datasetTitles: new Map([[A, "A renamed source"], [B, "Another renamed source"]]) });
    expect(hashes(renamed)).toEqual(base);
  });

  it("F19 R9: a resolution for a pair the run reports changes the Evidence fingerprint; one for earlier data does not", () => {
    expect(hashes(facts({ resolutions: [resolution()] })).evidence).not.toBe(base.evidence);
    const earlier = resolution({ mappedBy: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" });
    expect(hashes(facts({ resolutions: [earlier] })).evidence).toBe(base.evidence);
  });
});

function review(phase: PhaseReview["phase"], contentSha256: string, verdict: PhaseReview["verdict"], at: string, note: string | null = null, lines: string[] = ["old sentence"], headline = "h"): PhaseReview {
  return { id: `${phase}-${at}`, phase, contentSha256, verdict, note, summary: { templateVersion: 1, headline, lines }, reviewedByName: "Pat", reviewedAt: new Date(at) };
}
const viewOf = (views: ReturnType<typeof buildPhaseViews>, phase: string) => views.find((v) => v.phase === phase);

describe("R5/R8/R10: each phase is in one review state, derived from records", () => {
  const f = facts();
  const siteHash = derivePhaseOutputs(f).site?.contentSha256 ?? "";

  it("R5: with no reviews, every phase with output needs review", () => {
    const views = buildPhaseViews(f, []);
    expect(views.map((v) => v.state.kind)).toEqual(Array(6).fill("needs-review"));
    expect(views.every((v) => v.changes === null && v.history.length === 0)).toBe(true);
  });

  it("R5: a review of this exact output makes the phase reviewed or revision-requested", () => {
    expect(viewOf(buildPhaseViews(f, [review("site", siteHash, "reviewed", "2026-09-10T00:00:00Z")]), "site")?.state.kind).toBe("reviewed");
    expect(viewOf(buildPhaseViews(f, [review("site", siteHash, "revision_requested", "2026-09-10T00:00:00Z", "Check")]), "site")?.state.kind).toBe("revision-requested");
  });

  it("R8: the newest review at the current output decides, and history is newest first", () => {
    const reviews = [
      review("site", siteHash, "revision_requested", "2026-09-10T00:00:00Z", "Check"),
      review("site", siteHash, "reviewed", "2026-09-11T00:00:00Z"),
    ];
    const site = viewOf(buildPhaseViews(f, reviews), "site");
    expect(site?.state.kind).toBe("reviewed");
    expect(site?.history.map((r) => r.verdict)).toEqual(["reviewed", "revision_requested"]);
  });

  it("R7: a review made on a different output is never carried over: the phase needs review again", () => {
    const old = review("site", "0".repeat(64), "reviewed", "2026-09-10T00:00:00Z", null, ["Source: Traced from sheet C2.0."], "Study area drawn: 10.0 acres (revision 1).");
    const site = viewOf(buildPhaseViews(f, [old]), "site");
    expect(site?.state).toMatchObject({ kind: "needs-review", changedSince: { id: old.id } });
    // R10: what changed is the sentences added and removed
    expect(site?.changes?.removed).toEqual(["Study area drawn: 10.0 acres (revision 1)."]);
    expect(site?.changes?.added).toContain("Study area drawn: 18.4 acres (revision 1).");
  });

  it("R4/R5: a phase without output is 'to do' or 'updating', with the reason", () => {
    const noFootprint = buildPhaseViews(facts({ footprint: null }), []);
    expect(viewOf(noFootprint, "footprint")?.state).toEqual({ kind: "to-do", reason: "no-footprint" });
    const notCurrent = buildPhaseViews(facts({ status: { kind: "running", runId: "r" }, run: null, rules: null }), []);
    expect(viewOf(notCurrent, "evidence")?.state).toEqual({ kind: "updating", status: { kind: "running", runId: "r" } });
  });
});

describe("R10: diffLines", () => {
  it("R10: reports the sentences added and removed, as multisets, in a fixed order", () => {
    expect(diffLines(["a", "b", "b", "c"], ["b", "c", "d", "d"])).toEqual({ added: ["d", "d"], removed: ["a", "b"] });
  });

  it("R10: identical summaries have no difference, and an empty side is all added or all removed", () => {
    expect(diffLines(["a", "b"], ["a", "b"])).toEqual({ added: [], removed: [] });
    expect(diffLines([], ["a"])).toEqual({ added: ["a"], removed: [] });
    expect(diffLines(["a"], [])).toEqual({ added: [], removed: ["a"] });
  });
});

// R3: the templates contain no evaluative words. Rendered over populated, empty, and gap-only fixtures.
const DENYLIST = /\b(safe|clear(ed|ance)?|waiv(e|ed|er)|acceptable|unacceptable|recommend\w*|approv\w*|den(y|ied|ial)|no study (is )?needed|not required)\b/i;

describe("R3: no drafted sentence renders a verdict", () => {
  const empty = (): AnalysisResults => ({ impacts: [], evidenceBase: { disagreements: [], gaps: [] }, screening: [], studyFlags: [], limits: [] });
  const gapOnly = (): AnalysisResults => ({
    ...empty(),
    evidenceBase: { disagreements: [], gaps: rules.resourceTypes.map((r) => ({ resourceType: r.key, reason: "no-dataset-mapped" as const })) },
    limits: [{ key: "boundary-set-by-site-study", resourceType: "wetlands", datasetVersionId: null }],
  });
  const ctx = (r: AnalysisResults, resolutions: EvidenceResolution[] = []): DraftContext => ({
    results: r, rules, datasetTitles: new Map([[A, "Source A"], [B, "Source B"]]), datasetLimitations: new Map(), resolutions,
  });
  const drafts = (c: DraftContext): Draft[] => [draftEvidence(c), draftScreening(c), draftStudies(c), draftImpact(c)];
  const texts = (all: Draft[]) => all.flatMap((d) => [d.headline, ...d.lines]);

  it.each([
    ["populated", ctx(results(), [resolution()])],
    ["empty", ctx(empty())],
    ["gap-only", ctx(gapOnly())],
  ])("R3: the %s fixture has no verdict-shaped word", (_name, c) => {
    for (const text of texts(drafts(c))) expect(text).not.toMatch(DENYLIST);
  });

  it("R3: the site and footprint templates have none either", () => {
    const g = { revision: 1, areaAcres: 1, sourceNote: "Sample data — illustrative", createdAt: new Date() };
    for (const text of texts([draftSite(g), draftFootprint(g)])) expect(text).not.toMatch(DENYLIST);
  });

  it("R2: an empty impact says it describes the mapped data, not a finding about the site (P2)", () => {
    const impact = draftImpact(ctx(empty()));
    expect(impact.headline).toBe("No mapped resource or buffer overlaps the footprint.");
    expect(impact.lines).toContain("This describes the mapped data, not a finding about the site.");
  });

  it("R6 of study-scoping: the Studies draft says an unflagged study is the city's call, and never 'not needed'", () => {
    const studies = draftStudies(ctx(empty()));
    expect(studies.lines.join(" ")).toContain("not flagged by mapped data. The city decides which studies an application needs.");
    expect(studies.headline).toBe("0 of 3 studies named in the profile are flagged by mapped data.");
  });

  it("P2: an unflagged study whose triggering resource has no dataset says the data can't flag it, not just 'not flagged'", () => {
    const studies = draftStudies(ctx(gapOnly()));
    const text = studies.lines.join(" ");
    expect(text).toContain("No dataset covers");
    expect(text).toContain("so mapped data can't flag it there.");
    expect(text).not.toMatch(DENYLIST);
  });

  it("F19: a recorded resolution is stated as the planner's reliance, and says the measurements are unchanged", () => {
    const evidence = draftEvidence(ctx(results(), [resolution()]));
    expect(evidence.lines.join("\n")).toContain("The planner relies on Source A (revision 1). The measurements above are unchanged.");
  });

  it("R2: the same facts draft the same words every time", () => {
    expect(JSON.stringify(drafts(ctx(results())))).toBe(JSON.stringify(drafts(ctx(results()))));
  });
});
