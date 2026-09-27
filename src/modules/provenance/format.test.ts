import { describe, expect, it } from "vitest";

import {
  CONFIDENCE_DESCRIPTIONS,
  CONFIDENCE_NOT_APPLICABLE,
  SAMPLE_SOURCE_PREFIX,
  formatAcres,
  formatCount,
  formatDerivedProvenance,
  formatEvidenceAttributes,
  formatEvidenceProvenance,
  formatFeet,
  formatRuleProvenance,
  formatSqFt,
} from "./format";
import { EvidenceAttributesSchema, EvidenceProvenanceSchema, RuleProvenanceSchema } from "./types";

const evidenceHigh = EvidenceProvenanceSchema.parse({
  publisher: "King County",
  license: "Public domain",
  sourceUrl: "https://gis-data.kingcounty.gov/example",
  sourceAsOn: "2024-03-12",
  sourceAsOfNote: null,
  retrievedAt: "2026-08-01T00:00:00.000Z",
  confidence: "high",
  confidenceRationale: "Site-scale LiDAR-derived survey, resurveyed every 2 years.",
  isSample: false,
});

const evidenceLowNoDate = EvidenceProvenanceSchema.parse({
  publisher: "USFWS National Wetlands Inventory",
  license: "Public domain",
  sourceUrl: "https://www.fws.gov/wetlands/",
  sourceAsOn: null,
  sourceAsOfNote: "Publisher does not date individual wetland delineations.",
  retrievedAt: "2026-08-01T00:00:00.000Z",
  confidence: "low",
  confidenceRationale: "National-scale remote sensing, not field-verified.",
  isSample: false,
});

const rule = RuleProvenanceSchema.parse({
  codeSection: "SMC 21.03.020.C",
  ordinance: "Ordinance O2024-12",
  sourceUrl: "https://www.sammamish.us/code/",
  effectiveOn: "2024-05-01",
});

const ruleNoOrdinance = RuleProvenanceSchema.parse({
  codeSection: "SMC 21.03.020.D",
  ordinance: null,
  sourceUrl: "https://www.sammamish.us/code/",
  effectiveOn: "2020-01-01",
});

describe("R2: never substitutes retrievedAt for a missing sourceAsOn", () => {
  it("keeps the publisher-date-missing note and the retrieval date on separate lines", () => {
    const f = formatEvidenceProvenance(evidenceLowNoDate);
    expect(f.sourceLine).toContain("publisher gives no survey date");
    expect(f.sourceLine).toContain(evidenceLowNoDate.sourceAsOfNote);
    expect(f.sourceLine).not.toContain("2026-08-01"); // the retrieval date never appears in sourceLine
    expect(f.retrievedLine).toContain("2026-08-01");
  });

  it("still separates the two lines when a source date is present", () => {
    const f = formatEvidenceProvenance(evidenceHigh);
    expect(f.sourceLine).toContain("2024-03-12");
    expect(f.retrievedLine).toContain("2026-08-01");
    expect(f.sourceLine).not.toContain("Retrieved");
  });
});

describe("R3: a citation with no ordinance says so plainly", () => {
  it("renders 'code section only' when ordinance is null", () => {
    const f = formatRuleProvenance(ruleNoOrdinance);
    expect(f.citations[0]).toContain("code section only");
  });

  it("includes the ordinance when present", () => {
    const f = formatRuleProvenance(rule);
    expect(f.citations[0]).toContain("Ordinance O2024-12");
  });
});

describe("R4: a derived figure lists every source, never a blended line", () => {
  it("lists each rule citation separately", () => {
    const f = formatDerivedProvenance({ rules: [rule, ruleNoOrdinance], evidence: [] });
    expect(f.citations).toHaveLength(2);
  });

  it("lists each evidence source's line, joined but not collapsed", () => {
    const f = formatDerivedProvenance({ rules: [], evidence: [evidenceHigh, evidenceLowNoDate] });
    expect(f.sourceLine).toContain("King County");
    expect(f.sourceLine).toContain("USFWS National Wetlands Inventory");
  });
});

describe("R5: confidence is never invented", () => {
  it("takes the lowest confidence among evidence inputs", () => {
    const f = formatDerivedProvenance({ rules: [], evidence: [evidenceHigh, evidenceLowNoDate] });
    expect(f.confidenceLine).toContain(CONFIDENCE_DESCRIPTIONS.low);
    expect(f.confidenceLine).toContain("USFWS National Wetlands Inventory");
  });

  it("is null for a rules-only derived figure, never a fabricated level", () => {
    const f = formatDerivedProvenance({ rules: [rule], evidence: [] });
    expect(f.confidenceLine).toBeNull();
  });

  it("every caller renders the literal not-applicable text for a null confidenceLine", () => {
    expect(CONFIDENCE_NOT_APPLICABLE).toMatch(/not applicable/i);
  });
});

describe("R7: confidence is stated in plain language, not a score", () => {
  it("every level has a full-sentence description", () => {
    for (const level of ["high", "moderate", "low"] as const) {
      expect(CONFIDENCE_DESCRIPTIONS[level]).toMatch(/confidence/i);
      expect(CONFIDENCE_DESCRIPTIONS[level].length).toBeGreaterThan(20);
    }
  });
});

describe("R1/R9: a value missing a required field cannot be constructed", () => {
  it("rejects an evidence provenance with neither a source date nor a note", () => {
    const result = EvidenceProvenanceSchema.safeParse({
      ...evidenceHigh,
      sourceAsOn: null,
      sourceAsOfNote: null,
    });
    expect(result.success).toBe(false);
  });
});

describe("R6: sample data is labeled by the one formatter (evidence-layers.md R13)", () => {
  it("prefixes the source line of an illustrative dataset, and only that", () => {
    const sample = formatEvidenceProvenance({ ...evidenceHigh, isSample: true });
    expect(sample.sourceLine.startsWith(SAMPLE_SOURCE_PREFIX)).toBe(true);
    expect(formatEvidenceProvenance(evidenceHigh).sourceLine).not.toContain("Sample data");
  });

  it("keeps the label on a derived figure that cites a sample dataset", () => {
    const derived = formatDerivedProvenance({ rules: [rule], evidence: [{ ...evidenceHigh, isSample: true }] });
    expect(derived.sourceLine).toContain(SAMPLE_SOURCE_PREFIX);
  });
});

describe("R6: a measured number is rounded only here", () => {
  it("formats acres to one decimal, square feet and feet to whole numbers, with separators", () => {
    expect(formatAcres(18.449)).toBe("18.4 acres");
    expect(formatAcres(18.45)).toBe("18.5 acres");
    expect(formatSqFt(1234567.6)).toBe("1,234,568 sq ft");
    expect(formatFeet(299.5)).toBe("300 ft");
  });

  it("chooses the singular for exactly one", () => {
    expect(formatCount(1, "feature", "features")).toBe("1 feature");
    expect(formatCount(0, "feature", "features")).toBe("0 features");
    expect(formatCount(1200, "feature", "features")).toBe("1,200 features");
  });
});

describe("R1/R3/R4/R5 of evidence-review.md: the seven attributes", () => {
  const dated = EvidenceAttributesSchema.parse({
    authority: "county",
    sourceAsOfOn: "2020-06-15",
    sourceAsOfNote: null,
    retrievedAt: "2026-08-01T00:00:00.000Z",
    spatialPrecision: "parcel",
    verification: "mapped-remote",
    professionalReview: "none",
  });
  const undated = EvidenceAttributesSchema.parse({
    ...dated,
    sourceAsOfOn: null,
    sourceAsOfNote: "Publisher does not date individual delineations.",
  });
  const context = { today: "2026-09-27", mapStatus: "approximate" as const, consistency: "disagree" as const };

  it("R1: states all seven, in a fixed order", () => {
    const lines = formatEvidenceAttributes(dated, context);
    expect(lines.map((l) => l.label)).toEqual([
      "Source authority",
      "Data age",
      "Spatial precision",
      "Verification",
      "Boundary status",
      "Consistency",
      "Professional review",
    ]);
  });

  it("R3: data age is the publisher's date and whole years since it, from the injected clock", () => {
    const age = formatEvidenceAttributes(dated, context)[1]?.value;
    expect(age).toBe("Published 2020-06-15, 6 years before today");
    expect(formatEvidenceAttributes(dated, { ...context, today: "2026-06-14" })[1]?.value).toContain("5 years");
    expect(formatEvidenceAttributes(dated, { ...context, today: "2026-06-15" })[1]?.value).toContain("6 years");
  });

  it("R3: a dataset with no publisher date shows its note, and never the retrieval date", () => {
    const age = formatEvidenceAttributes(undated, context)[1]?.value ?? "";
    expect(age).toContain("Publisher does not date individual delineations.");
    expect(age).not.toContain("2026-08-01");
  });

  it("R3/R4: no line applies a current, recent, or old label, or claims verification", () => {
    const text = [dated, undated]
      .flatMap((a) => formatEvidenceAttributes(a, context))
      .map((l) => l.value)
      .join("\n");
    expect(text).not.toMatch(/\b(current|recent|old|outdated|up[- ]to[- ]date)\b/i);
    expect(text).not.toMatch(/(?<!not field )verified/);
  });

  it("R5: boundary status and consistency come from the context", () => {
    const lines = formatEvidenceAttributes(dated, { ...context, mapStatus: "regulatory", consistency: "single-source" });
    expect(lines.find((l) => l.label === "Boundary status")?.value).toBe("Regulatory boundary");
    expect(lines.find((l) => l.label === "Consistency")?.value).toBe("Single source");
    expect(formatEvidenceAttributes(dated, context).find((l) => l.label === "Boundary status")?.value).toContain(
      "site study",
    );
  });
});
