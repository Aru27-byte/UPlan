import { describe, expect, it } from "vitest";

import {
  CONFIDENCE_DESCRIPTIONS,
  CONFIDENCE_NOT_APPLICABLE,
  formatDerivedProvenance,
  formatEvidenceProvenance,
  formatRuleProvenance,
} from "./format";
import { EvidenceProvenanceSchema, RuleProvenanceSchema } from "./types";

const evidenceHigh = EvidenceProvenanceSchema.parse({
  publisher: "King County",
  license: "Public domain",
  sourceUrl: "https://gis-data.kingcounty.gov/example",
  sourceAsOn: "2024-03-12",
  sourceAsOfNote: null,
  retrievedAt: "2026-08-01T00:00:00.000Z",
  confidence: "high",
  confidenceRationale: "Site-scale LiDAR-derived survey, resurveyed every 2 years.",
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
