import { describe, expect, it } from "vitest";

import { ProfileDocumentSchema } from "./schema";

const citation = {
  codeSection: "SMC 21.03.020.C",
  ordinance: "O2024-12",
  sourceUrl: "https://www.sammamish.us/code/",
};

function baseDocument() {
  return {
    schemaVersion: 1 as const,
    resourceTypes: [
      {
        key: "wetlands",
        label: "Wetlands",
        ruleSet: "critical-areas" as const,
        mapStatus: "approximate" as const,
      },
      {
        key: "forest-canopy",
        label: "Forest canopy",
        ruleSet: "trees" as const,
        mapStatus: "approximate" as const,
      },
    ],
    bufferRules: [],
    studyTriggers: [],
    treeRules: [],
    settings: {
      vesting: [
        { ruleSet: "critical-areas" as const, vests: false },
        { ruleSet: "trees" as const, vests: false },
      ],
      retention: [
        { recordType: "decision" as const, retainYears: 6, countFrom: "created" as const },
        { recordType: "report" as const, retainYears: 6, countFrom: "report-released" as const },
        { recordType: "profile-change" as const, retainYears: 6, countFrom: "created" as const },
        { recordType: "records-export" as const, retainYears: 2, countFrom: "created" as const },
      ],
      exportFormats: ["pdf" as const],
    },
  };
}

describe("R11: a profile document is self-consistent", () => {
  it("accepts a well-formed document", () => {
    expect(ProfileDocumentSchema.safeParse(baseDocument()).success).toBe(true);
  });

  it("rejects a duplicate resource type key", () => {
    const doc = baseDocument();
    const [first] = doc.resourceTypes;
    if (!first) throw new Error("baseDocument() fixture must include at least one resourceType");
    doc.resourceTypes.push({ ...first });
    expect(ProfileDocumentSchema.safeParse(doc).success).toBe(false);
  });

  it("rejects a buffer rule referencing an unknown resource type", () => {
    const doc = baseDocument();
    (doc.bufferRules as unknown[]).push({
      key: "wetland-buffer",
      resourceType: "streams",
      appliesWhen: null,
      widthFt: 50,
      citation,
      effectiveOn: "2020-01-01",
      repealedOn: null,
    });
    expect(ProfileDocumentSchema.safeParse(doc).success).toBe(false);
  });

  it("rejects two entries for the same rule key in force on the same day", () => {
    const doc = baseDocument();
    const rule = {
      key: "wetland-buffer",
      resourceType: "wetlands",
      appliesWhen: null,
      widthFt: 50,
      citation,
      effectiveOn: "2020-01-01",
      repealedOn: null,
    };
    (doc.bufferRules as unknown[]).push(rule, { ...rule, widthFt: 75 });
    expect(ProfileDocumentSchema.safeParse(doc).success).toBe(false);
  });

  it("accepts two entries for the same rule key when one is repealed before the other starts", () => {
    const doc = baseDocument();
    (doc.bufferRules as unknown[]).push(
      {
        key: "wetland-buffer",
        resourceType: "wetlands",
        appliesWhen: null,
        widthFt: 50,
        citation,
        effectiveOn: "2018-01-01",
        repealedOn: "2020-01-01",
      },
      {
        key: "wetland-buffer",
        resourceType: "wetlands",
        appliesWhen: null,
        widthFt: 75,
        citation,
        effectiveOn: "2020-01-01",
        repealedOn: null,
      },
    );
    expect(ProfileDocumentSchema.safeParse(doc).success).toBe(true);
  });

  it("rejects a repealedOn that isn't after effectiveOn", () => {
    const doc = baseDocument();
    (doc.bufferRules as unknown[]).push({
      key: "wetland-buffer",
      resourceType: "wetlands",
      appliesWhen: null,
      widthFt: 50,
      citation,
      effectiveOn: "2020-01-01",
      repealedOn: "2020-01-01",
    });
    expect(ProfileDocumentSchema.safeParse(doc).success).toBe(false);
  });

  it("rejects a document missing a vesting entry for a rule set", () => {
    const doc = baseDocument();
    doc.settings.vesting = doc.settings.vesting.filter((v) => v.ruleSet !== "trees");
    expect(ProfileDocumentSchema.safeParse(doc).success).toBe(false);
  });

  it("rejects a document missing a retention entry for a record type", () => {
    const doc = baseDocument();
    doc.settings.retention = doc.settings.retention.filter((r) => r.recordType !== "report");
    expect(ProfileDocumentSchema.safeParse(doc).success).toBe(false);
  });
});

describe("R1: every rule requires a citation", () => {
  it("rejects a buffer rule with no ordinance and no code section", () => {
    const doc = baseDocument();
    const result = ProfileDocumentSchema.safeParse({
      ...doc,
      bufferRules: [
        {
          key: "b1",
          resourceType: "wetlands",
          appliesWhen: null,
          widthFt: 50,
          citation: { codeSection: "", ordinance: null, sourceUrl: "https://x" },
          effectiveOn: "2020-01-01",
          repealedOn: null,
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
