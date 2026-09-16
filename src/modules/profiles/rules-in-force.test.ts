import { describe, expect, it } from "vitest";

import { resolveRulesInForce, ruleSetResolutionDate } from "./rules-in-force";
import type { ProfileDocument } from "./schema";

const citation = {
  codeSection: "SMC 21.03.020.C",
  ordinance: "O2024-12",
  sourceUrl: "https://www.sammamish.us/code/",
};

function documentWithOneBufferAmendedOnce(vestsCriticalAreas: boolean): ProfileDocument {
  return {
    schemaVersion: 1,
    resourceTypes: [
      { key: "wetlands", label: "Wetlands", ruleSet: "critical-areas", mapStatus: "approximate" },
    ],
    bufferRules: [
      {
        key: "wetland-buffer",
        resourceType: "wetlands",
        appliesWhen: null,
        widthFt: 50,
        citation,
        effectiveOn: "2018-01-01",
        repealedOn: "2024-05-01",
      },
      {
        key: "wetland-buffer",
        resourceType: "wetlands",
        appliesWhen: null,
        widthFt: 75,
        citation,
        effectiveOn: "2024-05-01",
        repealedOn: null,
      },
    ],
    studyTriggers: [],
    treeRules: [],
    settings: {
      vesting: [
        { ruleSet: "critical-areas", vests: vestsCriticalAreas },
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
}

describe("R3/R5/R10: resolveRulesInForce — golden fixture across a rule's effective/repeal dates", () => {
  const doc = documentWithOneBufferAmendedOnce(false);

  it("resolves the 50ft entry the day before the amendment", () => {
    const { rules } = resolveRulesInForce(doc, "2024-04-30", null);
    expect(rules.bufferRules).toHaveLength(1);
    expect(rules.bufferRules[0]?.widthFt).toBe(50);
  });

  it("resolves the 75ft entry exactly on the effective date", () => {
    const { rules } = resolveRulesInForce(doc, "2024-05-01", null);
    expect(rules.bufferRules).toHaveLength(1);
    expect(rules.bufferRules[0]?.widthFt).toBe(75);
  });

  it("still resolves the 75ft entry a year later", () => {
    const { rules } = resolveRulesInForce(doc, "2025-05-01", null);
    expect(rules.bufferRules[0]?.widthFt).toBe(75);
  });
});

describe("R3: vesting resolves to the filing date; non-vesting resolves to today", () => {
  it("a non-vesting rule set always resolves to today, regardless of filing date", () => {
    const date = ruleSetResolutionDate(
      documentWithOneBufferAmendedOnce(false),
      "critical-areas",
      "2026-01-01",
      "2020-01-01",
    );
    expect(date).toBe("2026-01-01");
  });

  it("a vesting rule set resolves to the filing date", () => {
    const date = ruleSetResolutionDate(
      documentWithOneBufferAmendedOnce(true),
      "critical-areas",
      "2026-01-01",
      "2020-06-01",
    );
    expect(date).toBe("2020-06-01");
  });

  it("a vesting rule set with no filing date fails validation, never silently falls back to today", () => {
    expect(() =>
      ruleSetResolutionDate(documentWithOneBufferAmendedOnce(true), "critical-areas", "2026-01-01", null),
    ).toThrow(/has no application_filed_on/);
  });
});

describe("R8: determinism", () => {
  it("resolving the same document at the same date twice produces identical results", () => {
    const doc = documentWithOneBufferAmendedOnce(false);
    const a = resolveRulesInForce(doc, "2025-01-01", null);
    const b = resolveRulesInForce(doc, "2025-01-01", null);
    expect(a).toEqual(b);
  });
});
