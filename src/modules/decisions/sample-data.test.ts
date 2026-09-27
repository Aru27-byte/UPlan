import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MultiPolygonSchema } from "./geometry";
import { SAMPLE_DETAILS, SAMPLE_FOOTPRINT, SAMPLE_NOTE_PREFIX, SAMPLE_STUDY_AREA, isSampleNote } from "./sample-data";

// TechDesign/sample-data.md — pure checks; the database behavior is in sample-data.integration.test.ts.

describe("F23 R7: sample data never presents itself as real", () => {
  it("R7: every free-text sample value says it is a sample or fictional", () => {
    const texts = [SAMPLE_DETAILS.title, SAMPLE_DETAILS.parcelOrAddress, SAMPLE_DETAILS.applicant, SAMPLE_DETAILS.projectManager];
    for (const value of texts) expect(value, value).toMatch(/sample|fictional/i);
  });

  it("R6: a sample boundary's source note carries the label, and a drawn one doesn't", () => {
    expect(isSampleNote(`${SAMPLE_NOTE_PREFIX}illustrative study area`)).toBe(true);
    expect(isSampleNote("Traced from sheet C2.0")).toBe(false);
    expect(isSampleNote("Uploaded file: sample data.geojson")).toBe(false);
  });

  it("R2: the fixtures are valid MultiPolygons, and the footprint sits inside the study area", () => {
    expect(MultiPolygonSchema.safeParse(SAMPLE_STUDY_AREA).success).toBe(true);
    expect(MultiPolygonSchema.safeParse(SAMPLE_FOOTPRINT).success).toBe(true);
    const studyRing = SAMPLE_STUDY_AREA.coordinates[0]?.[0] ?? [];
    const lons = studyRing.map((p) => p[0] ?? 0);
    const lats = studyRing.map((p) => p[1] ?? 0);
    for (const [lon, lat] of SAMPLE_FOOTPRINT.coordinates[0]?.[0] ?? []) {
      expect(lon).toBeGreaterThanOrEqual(Math.min(...lons));
      expect(lon).toBeLessThanOrEqual(Math.max(...lons));
      expect(lat).toBeGreaterThanOrEqual(Math.min(...lats));
      expect(lat).toBeLessThanOrEqual(Math.max(...lats));
    }
  });
});

describe("F23 R4: the analysis treats sample data exactly like real data", () => {
  it("R4: nothing in analysis or workflow's computation reads a sample mark", () => {
    // The label is for display: workflow states 'this boundary is sample data' in a drafted sentence, and
    // reports and pages show the label. The analysis itself — pinning, running, screening, impact — must
    // not branch on it, so this checks the analysis module's sources.
    const dir = join(__dirname, "..", "analysis");
    const sources = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    expect(sources.length).toBeGreaterThan(5);
    for (const file of sources) {
      expect(readFileSync(join(dir, file), "utf8"), file).not.toMatch(/isSampleNote|is_sample|isSample\b|SAMPLE_NOTE/);
    }
  });
});
