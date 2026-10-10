import { describe, expect, it } from "vitest";

import type { AnalysisResults, EvidenceResolution } from "@/modules/analysis";
import { buildSampleProfileDocument, resolveRulesInForce } from "@/modules/profiles";
import { buildPhaseViews, type PhaseFacts, type PhaseReview } from "@/modules/workflow";

import { buildRequest, type BuildContext } from "./inputs";
import { ASSISTS, ASSIST_IDS, type AssistId } from "./kinds";

// F24 R8: only the allow-listed classes leave UPlan. A project is built whose every identifying and
// free-text field holds a unique sentinel, every builder is run, and no sentinel may appear anywhere in the
// serialized request. The builders are never handed a decision, so this holds by construction; the test is
// what keeps it true when someone adds a field.

const SENTINELS = {
  studyAreaNote: "SENTINEL-STUDY-AREA-NOTE-91f3",
  footprintNote: "SENTINEL-FOOTPRINT-NOTE-77ab",
  rationale: "SENTINEL-RESOLUTION-RATIONALE-5c21",
  reviewNote: "SENTINEL-REVIEW-NOTE-0d4e",
  person: "SENTINEL-PERSON-NAME-b8a6",
};

const rules = resolveRulesInForce(buildSampleProfileDocument(), "2026-09-27", null).rules;
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const results: AnalysisResults = {
  impacts: [
    { impactKey: "wetlands:a:1:feature-area-in-footprint", resourceType: "wetlands", measure: "feature-area-in-footprint", unit: "us-survey-sq-ft", min: 0, max: 4210, dependsOn: "wetland category", approximate: false, ruleKeys: [], evidence: [{ datasetVersionId: A, sourceFeatureId: "1" }] },
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

const resolution: EvidenceResolution = {
  decisionId: "d", resourceTypeKey: "wetlands", mappedBy: A, notMappedBy: B, revision: 1, reliedOn: "mapped_by",
  rationale: SENTINELS.rationale, createdBy: "u", createdAt: new Date("2026-09-03T00:00:00Z"),
};

const facts: PhaseFacts = {
  studyArea: { revision: 1, areaAcres: 18.44, sourceNote: SENTINELS.studyAreaNote, createdAt: new Date("2026-09-01T00:00:00Z") },
  footprint: { revision: 1, areaAcres: 6.1, sourceNote: SENTINELS.footprintNote, createdAt: new Date("2026-09-02T00:00:00Z") },
  status: { kind: "current", runId: "run-1" },
  run: { id: "run-1", results, profileVersionId: "p1", profileVersionNumber: 2, datasetVersionIds: [A, B] },
  rules,
  resolvedFor: { "critical-areas": "2026-09-27", trees: "2026-09-27" },
  datasetTitles: new Map([[A, "Wetlands (county)"], [B, "Wetlands (state)"]]),
  datasetLimitations: new Map([[A, "Mapped from aerial photography; small wetlands are missed."]]),
  resolutions: [resolution],
};

const review: PhaseReview = {
  id: "r1", phase: "evidence", contentSha256: "x", verdict: "reviewed", note: SENTINELS.reviewNote,
  summary: { templateVersion: 1, headline: "h", lines: [] }, reviewedByName: SENTINELS.person, reviewedAt: new Date("2026-09-04T00:00:00Z"),
};

const phases = buildPhaseViews(facts, [review]);

const ctx: BuildContext = {
  workflow: { facts, phases },
  codePassages: [{ id: "chunk:1", sectionPath: "21A.50.290", body: "The standard buffer for a Category II wetland is 100 feet." }],
  question: "What is the buffer for a wetland?",
  datasetMeta: [A, B].map((versionId) => ({
    versionId, title: `Dataset ${versionId.slice(0, 2)}`, publisher: "King County", license: "CC0", authority: "county",
    spatialPrecision: "regional", sourceAsOfOn: "2020-05-01", sourceAsOfNote: null, limitation: null,
  })),
  suppliedText: { label: "City checklist", text: "A geotechnical report is required." },
  boundTo: "bound-hash",
  profile: { rules, ruleValues: [{ path: "bufferRules.x.widthFt", value: 100 }], documentSha256: "doc-hash" },
};

const SUBJECTS: Record<AssistId, string> = {
  PR1: "doc",
  PR2: "q",
  EV1: "",
  EV2: `wetlands:${A}:${B}`,
  EV3: A,
  SC1: `row:wetlands:${A}`,
  SC2: "",
  SC3: `row:wetlands:${A}`,
  ST1: "critical-area-study",
  ST2: "",
  ST3: "doc",
  IM1: "",
  IM2: "range:wetlands:a:1:feature-area-in-footprint",
  IM3: "wetlands",
};

describe("R8: only allow-listed text leaves UPlan", () => {
  it.each(ASSIST_IDS)("R8: %s sends no sentinel from the project's identity, notes, or people", (id) => {
    const built = buildRequest(id, SUBJECTS[id], ctx);
    const sent = JSON.stringify(built.request);
    for (const sentinel of Object.values(SENTINELS)) expect(sent).not.toContain(sentinel);
    expect(built.request.assistId).toBe(id);
    expect(built.request.kind).toBe(ASSISTS[id].kind);
    expect(built.request.promptVersion).toBe(ASSISTS[id].promptVersion);
  });

  it("R8: a request carries no key the schema doesn't name", () => {
    const built = buildRequest("EV1", "", ctx);
    expect(Object.keys(built.request).sort()).toEqual(["assistId", "kind", "passages", "promptVersion", "question", "refs", "ruleValues", "task"]);
  });

  it("R10: a phase assist is bound to the phase output's fingerprint", () => {
    const evidence = phases.find((p) => p.phase === "evidence")?.output;
    expect(buildRequest("EV1", "", ctx).outputSha256).toBe(evidence?.contentSha256);
    expect(buildRequest("IM1", "", ctx).outputSha256).toBe(phases.find((p) => p.phase === "impact")?.output?.contentSha256);
  });

  it("R4: an assist about something the analysis doesn't contain is a stated refusal, not an empty request", () => {
    expect(() => buildRequest("EV2", `wetlands:${B}:${A}`, ctx)).toThrow(/not in the current analysis/);
    expect(() => buildRequest("SC1", `row:wetlands:${B}`, ctx)).toThrow(/not in the current screening/);
    expect(() => buildRequest("IM2", "range:nothing", ctx)).toThrow(/not a range/);
  });

  it("R4: a Find with no indexed code text is a stated refusal", () => {
    expect(() => buildRequest("PR2", "q", { ...ctx, codePassages: [] })).toThrow(/code text/);
  });

  it("R11: a phase with no output is a stated refusal", () => {
    const empty = buildPhaseViews({ ...facts, status: { kind: "out-of-date", changes: [] }, run: null, rules: null }, []);
    expect(() => buildRequest("EV1", "", { ...ctx, workflow: { facts, phases: empty } })).toThrow(/no output yet/);
  });
});
