import { describe, expect, it } from "vitest";

import {
  AnalysisResultsSchema,
  RESULTS_VERSION,
  ScreeningRowSchema,
  StudyFlagSchema,
  orderResults,
  sortScreening,
  type AnalysisResults,
  type ScreeningRow,
} from "./results";

function screeningRow(overrides: Partial<ScreeningRow> = {}): ScreeningRow {
  return {
    resourceType: "wetlands",
    datasetVersionId: "v1",
    intersectingFeatureCount: 0,
    overlapAreaSqFt: 0,
    overlapLengthFt: 0,
    searchedWithinFt: 100,
    nearestDistanceFt: null,
    bufferReaches: [],
    approximate: false,
    ...overrides,
  };
}

function fixture(): AnalysisResults {
  return {
    impacts: [
      {
        impactKey: "b:x:1:feature-area-in-footprint",
        resourceType: "b",
        measure: "feature-area-in-footprint",
        unit: "us-survey-sq-ft",
        min: 1,
        max: 1,
        dependsOn: null,
        approximate: false,
        ruleKeys: [],
        evidence: [],
      },
      {
        impactKey: "a:x:1:feature-area-in-footprint",
        resourceType: "a",
        measure: "feature-area-in-footprint",
        unit: "us-survey-sq-ft",
        min: 1,
        max: 1,
        dependsOn: null,
        approximate: false,
        ruleKeys: [],
        evidence: [],
      },
    ],
    evidenceBase: {
      disagreements: [
        { resourceType: "b", mappedBy: "v2", notMappedBy: "v1", area: 5, unit: "us-survey-sq-ft" },
        { resourceType: "a", mappedBy: "v1", notMappedBy: "v2", area: 5, unit: "us-survey-sq-ft" },
      ],
      gaps: [
        { resourceType: "b", reason: "no-dataset-mapped" },
        { resourceType: "a", reason: "coverage-excludes-study-area" },
      ],
    },
    screening: [
      screeningRow({ resourceType: "streams", datasetVersionId: "v3" }),
      screeningRow({ resourceType: "wetlands", datasetVersionId: "v1", intersectingFeatureCount: 1, overlapAreaSqFt: 500, nearestDistanceFt: 0 }),
    ],
    studyFlags: [
      { triggerKey: "z-study", study: "critical-area-study", resourceType: "wetlands", nearestDistanceFt: 0, approximate: false, ruleKeys: ["z-study"], evidence: [] },
      { triggerKey: "a-study", study: "geotechnical-report", resourceType: "geologically-hazardous-areas", nearestDistanceFt: 12, approximate: true, ruleKeys: ["a-study"], evidence: [] },
    ],
    limits: [
      { key: "significant-trees-not-countable", resourceType: "forest-canopy", datasetVersionId: null },
      { key: "boundary-set-by-site-study", resourceType: "wetlands", datasetVersionId: null },
    ],
  };
}

describe("R7/R8: deterministic, locale-independent ordering", () => {
  it("sorts impacts by impactKey", () => {
    const ordered = orderResults(fixture());
    expect(ordered.impacts.map((i) => i.impactKey)).toEqual([
      "a:x:1:feature-area-in-footprint",
      "b:x:1:feature-area-in-footprint",
    ]);
  });

  it("sorts disagreements and gaps by resource type", () => {
    const ordered = orderResults(fixture());
    expect(ordered.evidenceBase.disagreements[0]?.resourceType).toBe("a");
    expect(ordered.evidenceBase.gaps[0]?.resourceType).toBe("a");
  });

  it("R13: sorts study flags by trigger key and screening in its display order", () => {
    const ordered = orderResults(fixture());
    expect(ordered.studyFlags.map((f) => f.triggerKey)).toEqual(["a-study", "z-study"]);
    expect(ordered.screening.map((r) => r.resourceType)).toEqual(["wetlands", "streams"]);
  });

  it("produces byte-identical output for the same input, called twice", () => {
    const a = JSON.stringify(orderResults(fixture()));
    const b = JSON.stringify(orderResults(fixture()));
    expect(a).toBe(b);
  });

  it("does not mutate its input", () => {
    const input = fixture();
    const copy = JSON.parse(JSON.stringify(input)) as AnalysisResults;
    orderResults(input);
    expect(input).toEqual(copy);
  });
});

describe("R10: the screening display order carries no rank", () => {
  it("R10: largest polygon overlap first, then line overlap, then nearest distance with 'none within reach' last", () => {
    const rows = sortScreening([
      screeningRow({ resourceType: "d", nearestDistanceFt: null }),
      screeningRow({ resourceType: "c", nearestDistanceFt: 80 }),
      screeningRow({ resourceType: "b", overlapLengthFt: 40, intersectingFeatureCount: 1, nearestDistanceFt: 0 }),
      screeningRow({ resourceType: "a", overlapAreaSqFt: 10, intersectingFeatureCount: 1, nearestDistanceFt: 0 }),
      screeningRow({ resourceType: "e", nearestDistanceFt: 20 }),
    ]);
    expect(rows.map((r) => r.resourceType)).toEqual(["a", "b", "e", "c", "d"]);
  });

  it("R10: no field of a screening row or a study flag is free text, a score, or a rank", () => {
    // The type shape is the guard: every key below is a measurement, a count, a key, or a flag.
    expect(Object.keys(ScreeningRowSchema.shape).sort()).toEqual([
      "approximate",
      "bufferReaches",
      "datasetVersionId",
      "intersectingFeatureCount",
      "nearestDistanceFt",
      "overlapAreaSqFt",
      "overlapLengthFt",
      "resourceType",
      "searchedWithinFt",
    ]);
    expect(Object.keys(StudyFlagSchema.shape).sort()).toEqual([
      "approximate",
      "evidence",
      "nearestDistanceFt",
      "resourceType",
      "ruleKeys",
      "study",
      "triggerKey",
    ]);
  });
});

describe("R13: the results document is versioned", () => {
  it("R13: the current version is 2, and a version-1 document is rejected rather than parsed as best it can", () => {
    expect(RESULTS_VERSION).toBe(2);
    const version1 = { impacts: [], evidenceBase: { disagreements: [], gaps: [] }, limits: [] };
    expect(AnalysisResultsSchema.safeParse(version1).success).toBe(false); // no screening, no studyFlags
  });
});
