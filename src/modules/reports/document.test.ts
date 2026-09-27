import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AnalysisResults } from "@/modules/analysis";
import type { ProfileDocument } from "@/modules/profiles";

import { ReportDocument, mapViewBox, type ReportDocumentProps } from "./document";
import { PHASE_KEYS, type ReportPhase, type ReportSnapshot } from "./snapshot";

// TechDesign/locked-report.md — R6/R7: a direct, automatable check that no rendered document ever
// contains verdict-shaped language, and that gaps and unflagged studies read as facts about the mapped
// data, never as clearance (P2).
const VERDICT_DENYLIST = [
  /recommend/i,
  /should be approved/i,
  /clear to develop/i,
  /\bsafe\b/i,
  /acceptable impact/i,
  /\bwaived?\b/i,
  /no study (is )?needed/i,
  /no constraints/i,
];

const trigger = {
  citation: { codeSection: "SMC 21A.50", ordinance: null, sourceUrl: "https://example.test/smc" },
  effectiveOn: "2023-10-20",
  repealedOn: null,
};

const profile: ProfileDocument = {
  schemaVersion: 1,
  resourceTypes: [
    { key: "wetlands", label: "Wetlands", ruleSet: "critical-areas", mapStatus: "approximate" },
    { key: "forest-canopy", label: "Forest canopy", ruleSet: "trees", mapStatus: "approximate" },
  ],
  bufferRules: [{ key: "wetlands-buffer", resourceType: "wetlands", appliesWhen: null, widthFt: 100, ...trigger }],
  studyTriggers: [
    { key: "wetlands-study", resourceType: "wetlands", study: "critical-area-study", withinFt: 100, ...trigger },
    { key: "canopy-study", resourceType: "forest-canopy", study: "arborist-report", withinFt: 0, ...trigger },
  ],
  treeRules: [],
  settings: {
    vesting: [
      { ruleSet: "critical-areas", vests: false },
      { ruleSet: "trees", vests: false },
    ],
    retention: [
      { recordType: "decision", retainYears: 6, countFrom: "created" },
      { recordType: "report", retainYears: 6, countFrom: "report-released" },
      { recordType: "profile-change", retainYears: 6, countFrom: "created" },
      { recordType: "records-export", retainYears: 2, countFrom: "created" },
    ],
    exportFormats: ["pdf"],
  },
};

const VERSION_ID = "11111111-1111-4111-8111-111111111111";

const results: AnalysisResults = {
  impacts: [
    {
      impactKey: "wetlands:nwi:1:feature-area-in-footprint",
      resourceType: "wetlands",
      measure: "feature-area-in-footprint",
      unit: "us-survey-sq-ft",
      min: 120,
      max: 120,
      dependsOn: null,
      approximate: true,
      ruleKeys: ["wetlands-buffer"],
      evidence: [{ datasetVersionId: VERSION_ID, sourceFeatureId: "1" }],
    },
  ],
  evidenceBase: { disagreements: [], gaps: [{ resourceType: "forest-canopy", reason: "coverage-excludes-study-area" }] },
  screening: [
    {
      resourceType: "wetlands",
      datasetVersionId: VERSION_ID,
      intersectingFeatureCount: 1,
      overlapAreaSqFt: 120,
      overlapLengthFt: 0,
      searchedWithinFt: 100,
      nearestDistanceFt: 0,
      bufferReaches: [],
      approximate: true,
    },
  ],
  studyFlags: [
    { triggerKey: "wetlands-study", study: "critical-area-study", resourceType: "wetlands", nearestDistanceFt: 0, approximate: true, ruleKeys: ["wetlands-study"], evidence: [{ datasetVersionId: VERSION_ID, sourceFeatureId: "1" }] },
  ],
  limits: [{ key: "significant-trees-not-countable", resourceType: "forest-canopy", datasetVersionId: null }],
};

const phase = (key: ReportPhase["phase"], changed: boolean): ReportPhase => ({
  phase: key,
  contentSha256: `${key}`.padEnd(64, "0"),
  verdict: "reviewed",
  note: key === "site" ? "Boundary matches the plan." : null,
  reviewedAt: "2026-09-27T20:00:00.000Z",
  reviewedByName: "Pat Planner",
  changed,
  summary: { templateVersion: 1, headline: `The ${key} headline.`, lines: [`The ${key} sentence.`] },
});

function snapshot(overrides: Partial<ReportSnapshot> = {}, usesSampleData = false, previous: number | null = null): ReportSnapshot {
  return {
    templateVersion: 2,
    details: {
      title: "Test Subdivision",
      applicationType: "subdivision",
      permitNumber: null,
      parcelOrAddress: null,
      applicant: "Example Applicant",
      projectManager: null,
      targetDecisionOn: null,
      applicationFiledOn: "2026-01-15",
      usesSampleData,
    },
    runId: "22222222-2222-4222-8222-222222222222",
    profileVersionId: "33333333-3333-4333-8333-333333333333",
    phases: PHASE_KEYS.map((k) => phase(k, previous === null || k === "impact")),
    resolutions: [],
    previousVersion: previous,
    detailsChanged: false,
    ...overrides,
  };
}

function props(overrides: Partial<ReportDocumentProps> = {}): ReportDocumentProps {
  return {
    cityName: "Sammamish",
    stateCode: "WA",
    timeZone: "America/Los_Angeles",
    versionNumber: 1,
    requestedAt: new Date("2026-09-27T20:00:00.000Z"),
    changeNote: null,
    snapshot: snapshot(),
    profileVersionNumber: 3,
    profileDocument: profile,
    rulesResolvedFor: { "critical-areas": "2026-09-27", trees: "2026-09-27" },
    results,
    impactProvenance: new Map(),
    datasetProvenance: new Map([
      [VERSION_ID, { publisher: "King County", license: "Public domain", sourceUrl: "https://example.test/d", sourceAsOn: "2024-03-12", sourceAsOfNote: null, retrievedAt: "2026-08-01T00:00:00.000Z", confidence: "moderate", confidenceRationale: "Test.", isSample: false }],
    ]),
    datasetTitles: new Map([[VERSION_ID, "Wetlands inventory"]]),
    datasetLimitations: new Map(),
    resolutions: [],
    studyAreaSvg: { path: "M0 0 L10 -10", xmin: 0, ymin: 0, xmax: 10, ymax: 10 },
    footprintSvg: null,
    ...overrides,
  };
}

const render = (p: ReportDocumentProps) => renderToStaticMarkup(ReportDocument(p));

describe("R6/R7: the document never recommends, and never reads a gap as clearance", () => {
  const html = render(props());

  it("R6: contains no verdict-shaped language, in any section", () => {
    for (const pattern of VERDICT_DENYLIST) expect(html).not.toMatch(pattern);
  });

  it("R7: states a gap as a fact about the mapped data, not a clearance", () => {
    expect(html).toContain("The mapped data does not cover the study area, so nothing can be said about it.");
    expect(html).toContain("A resource type with nothing mapped is a statement about the mapped data, not about the land.");
  });

  it("P2: a study the mapped data doesn't flag prints the fixed sentence, and a flagged one cites its rule", () => {
    expect(html).toContain("not flagged by mapped data. The city decides which studies an application needs.");
    expect(html).toContain("Critical area study:</strong> flagged by Wetlands");
    expect(html).toContain("SMC 21A.50 (code section only) (in force 2023-10-20)");
  });

  it("R3: states the tree-counting limit, and that an unrecorded feature will not appear", () => {
    expect(html).toContain("can&#x27;t be determined from remote data");
    expect(html).toContain("A stream, wetland, or other feature that no dataset records will not appear");
  });
});

describe("R15/R16: the cover, the review record, and the sample label", () => {
  it("R15: an unrecorded detail prints 'Not yet recorded', and a recorded one prints as recorded", () => {
    const html = render(props());
    expect(html).toContain("Not yet recorded");
    expect(html).toContain("Example Applicant");
    expect(html).toContain("Not yet assigned"); // permit number
  });

  it("R16: shows its version, the finish time in the city's zone, and the profile version", () => {
    const html = render(props({ versionNumber: 3 }));
    expect(html).toContain("Version 3");
    expect(html).toContain("Sep 27, 2026, 1:00 PM PDT");
    expect(html).toContain("Version 3</td>"); // the profile version row
  });

  it("R16: the review record lists every phase with its reviewer, time, and the reviewer's own note", () => {
    const html = render(props());
    for (const key of ["Site", "Evidence", "Screening", "Studies", "Footprint", "Impact"]) expect(html).toContain(`<th scope="row">${key}</th>`);
    expect(html).toContain("Pat Planner");
    expect(html).toContain("Boundary matches the plan.");
    expect(html).toContain("not a sign-off by anyone else");
  });

  it("F23 R6: a document built with sample data says so on its first page, and only then", () => {
    expect(render(props({ snapshot: snapshot({}, true) }))).toContain("<strong>Sample data.</strong>");
    expect(render(props())).not.toContain("<strong>Sample data.</strong>");
  });

  it("F22 R10: 'What changed' appears only after version 1, with the planner's reason and the changed phases", () => {
    expect(render(props())).not.toContain("What changed since");
    const second = render(
      props({ versionNumber: 2, changeNote: "New footprint after the applicant revised the plan", snapshot: snapshot({}, false, 1) }),
    );
    expect(second).toContain("What changed since version 1");
    expect(second).toContain("New footprint after the applicant revised the plan");
    expect(second).toContain("The Impact phase&#x27;s output changed and was reviewed again.");
    expect(second).not.toContain("The Site phase&#x27;s output changed");
  });

  it("R14: every dataset version and rule a figure cites is in the source register", () => {
    const html = render(props());
    expect(html).toContain("Source register");
    expect(html).toContain("Wetlands inventory");
    expect(html).toContain("King County (Public domain) — sourced 2024-03-12");
  });

  it("R14: a recorded resolution appears with its rationale, its author, and its revision", () => {
    const html = render(
      props({
        resolutions: [
          {
            resourceType: "wetlands",
            mappedByTitle: "Wetlands inventory",
            notMappedByTitle: "Alternate wetlands",
            revision: 2,
            reliedOn: "mapped_by",
            rationale: "The county's delineation is the more recent survey.",
            createdByName: "Pat Planner",
            createdAt: new Date("2026-09-27T21:00:00.000Z"),
          },
        ],
      }),
    );
    expect(html).toContain("Sources the planner relies on");
    expect(html).toContain("The county&#x27;s delineation is the more recent survey.");
    expect(html).toContain("(revision 2)");
    expect(html).toContain("both sources stay shown above");
  });
});

describe("R8: the maps are drawn to scale with a title and a description", () => {
  it("R8: the study area map has a <title> and a <desc>", () => {
    const html = render(props());
    expect(html).toContain('<title id="map-title">Study area and footprint</title>');
    expect(html).toContain('<desc id="map-desc">');
  });

  it("R8: the viewBox frames every boundary, with y negated the way ST_AsSVG negates it", () => {
    const box = mapViewBox(
      { path: "", xmin: 0, ymin: 0, xmax: 100, ymax: 200 },
      { path: "", xmin: 50, ymin: 20, xmax: 150, ymax: 120 },
    );
    const [x, y, w, h] = box.split(" ").map(Number);
    expect(x).toBeLessThan(0);
    expect((x ?? 0) + (w ?? 0)).toBeGreaterThan(150);
    expect(y).toBeLessThan(-200);
    expect((y ?? 0) + (h ?? 0)).toBeGreaterThan(0);
  });
});
