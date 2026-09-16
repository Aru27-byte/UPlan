import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import type { AnalysisResults } from "@/modules/analysis";
import type { ProfileDocument } from "@/modules/profiles";

import { ReportDocument, type ReportDocumentProps } from "./document";

// TechDesign/locked-report.md — R6/R7: a direct, automatable check that no rendered report ever
// contains verdict-shaped language. This is the one place such a check belongs — reports.md's own
// verification section calls for exactly this denylist test.
const VERDICT_DENYLIST = [
  /recommend/i,
  /should be approved/i,
  /clear to develop/i,
  /\bsafe\b/i,
  /acceptable impact/i,
];

const minimalProfile: ProfileDocument = {
  schemaVersion: 1,
  resourceTypes: [
    { key: "wetlands", label: "Wetlands", ruleSet: "critical-areas", mapStatus: "approximate" },
  ],
  bufferRules: [],
  studyTriggers: [],
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
      ruleKeys: [],
      evidence: [],
    },
  ],
  evidenceBase: {
    disagreements: [],
    gaps: [{ resourceType: "wetlands", reason: "coverage-excludes-study-area" }],
  },
  limits: [{ key: "significant-trees-not-countable", resourceType: "forest-canopy" }],
};

const props: ReportDocumentProps = {
  decisionTitle: "Test Subdivision",
  permitNumber: null,
  jurisdictionName: "City of Sammamish",
  applicationFiledOn: "2026-01-15",
  profileDocument: minimalProfile,
  results,
  impactProvenance: new Map(),
  studyAreaSvgPath: "M0 0 L1 1",
  footprintSvgPath: null,
};

describe("R6/R7: the report never recommends, and never reads a gap as clearance", () => {
  const html = renderToStaticMarkup(ReportDocument(props));

  it("contains no verdict-shaped language", () => {
    for (const pattern of VERDICT_DENYLIST) {
      expect(html).not.toMatch(pattern);
    }
  });

  it("states a gap as a fact, not a clearance", () => {
    expect(html).toContain("mapped data does not cover this study area");
    expect(html).not.toMatch(/no constraints/i);
  });

  it("states the tree-counting limit plainly", () => {
    expect(html).toContain("cannot be determined from remote data");
  });
});
