import { describe, expect, it } from "vitest";

import { ProfileDocumentSchema } from "./schema";
import { BELLEVUE_SAMPLE_CODE, REDMOND_SAMPLE_CODE, SAMMAMISH_SAMPLE_CODE, buildSampleProfileDocument } from "./sample-profile";

const cities = [
  ["Sammamish", SAMMAMISH_SAMPLE_CODE],
  ["Redmond", REDMOND_SAMPLE_CODE],
  ["Bellevue", BELLEVUE_SAMPLE_CODE],
] as const;

describe("R12: each city has an illustrative profile", () => {
  it.each(cities)("R12: the %s profile is a valid profile document", (_name, code) => {
    expect(() => ProfileDocumentSchema.parse(buildSampleProfileDocument(code))).not.toThrow();
  });

  it.each(cities)("R12/R1: every %s citation says the section is not verified", (_name, code) => {
    const document = buildSampleProfileDocument(code);
    const sections = [...document.bufferRules, ...document.studyTriggers, ...document.treeRules].map((r) => r.citation.codeSection);
    expect(sections.length).toBeGreaterThan(0);
    for (const section of sections) expect(section).toMatch(/not verified/);
  });

  it("R12: Redmond's and Bellevue's citations say their figures are copied from the Sammamish sample", () => {
    for (const code of [REDMOND_SAMPLE_CODE, BELLEVUE_SAMPLE_CODE]) {
      expect(code.criticalAreas.codeSection).toMatch(/copied from the Sammamish sample/);
      expect(code.trees.codeSection).toMatch(/copied from the Sammamish sample/);
    }
  });

  it("R12: the profiles differ only in their citations", () => {
    const strip = (code: (typeof cities)[number][1]) =>
      JSON.stringify(buildSampleProfileDocument(code), (key, value: unknown) => (key === "citation" ? null : value));
    expect(strip(REDMOND_SAMPLE_CODE)).toBe(strip(SAMMAMISH_SAMPLE_CODE));
    expect(strip(BELLEVUE_SAMPLE_CODE)).toBe(strip(SAMMAMISH_SAMPLE_CODE));
  });
});
