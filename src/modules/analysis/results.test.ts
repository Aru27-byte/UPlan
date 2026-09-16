import { describe, expect, it } from "vitest";

import { orderResults, type AnalysisResults } from "./results";

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
    limits: [
      { key: "significant-trees-not-countable", resourceType: "forest-canopy" },
      { key: "boundary-set-by-site-study", resourceType: "wetlands" },
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
