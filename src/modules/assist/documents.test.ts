import { describe, expect, it } from "vitest";

import { chunkText } from "./documents";

// F24 PR2: the city's code text is split at its section numbers so a quote's section can be compared exactly (K5).

describe("R4: chunking code text", () => {
  const code = [
    "21A.50.290 Wetland buffers.",
    "The standard buffer for a Category II wetland is 100 feet.",
    "",
    "21A.50.300 Stream buffers.",
    "A buffer of 150 feet shall be maintained from a Type F stream.",
  ].join("\n");

  it("R4: starts a new section at each section number and keeps that number as the path", () => {
    const chunks = chunkText(code);
    expect(chunks.map((c) => c.sectionPath)).toEqual(["21A.50.290", "21A.50.300"]);
    expect(chunks[0]?.body).toContain("Category II wetland is 100 feet");
    expect(chunks[1]?.body).toContain("Type F stream");
  });

  it("R4: a long section is split into pieces that each keep the section's number and stay under the embedder's limit", () => {
    const long = `21A.50.290 Wetland buffers.\n${Array.from({ length: 40 }, (_, i) => `Sentence number ${i} states a requirement about wetlands and their buffers.`).join(" ")}`;
    const chunks = chunkText(long);
    expect(chunks.length).toBeGreaterThan(1);
    expect(new Set(chunks.map((c) => c.sectionPath))).toEqual(new Set(["21A.50.290"]));
    for (const c of chunks) expect(c.body.length).toBeLessThanOrEqual(1_000);
  });

  it("R4: text with no section numbers is numbered by part, never given an invented section", () => {
    const chunks = chunkText("A checklist line about a geotechnical report.\n\nAnother line about an arborist report.");
    expect(chunks.every((c) => /^Part \d+$/.test(c.sectionPath))).toBe(true);
  });

  it("R4: no words are lost in the split", () => {
    const joined = chunkText(code).map((c) => c.body).join(" ");
    for (const word of ["Category", "II", "wetland", "100", "150", "Type", "stream"]) expect(joined).toContain(word);
  });
});
