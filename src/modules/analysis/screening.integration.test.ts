import { beforeAll, describe, expect, it } from "vitest";

import { createDecision, saveGeometry } from "@/modules/decisions";

import { addEvidence, createPerson, createReadyCity, planarGeometry, type City } from "../../../tests/support/factories";

import { buildEvidenceBase } from "./evidence-base";
import { pinInputs, type PinnedInputs } from "./pin-inputs";
import { computeScreening, computeStudyFlags } from "./screening";
import { describeScreeningRow } from "./screening-text";

// TechDesign/study-scoping.md — golden fixtures (.claude/rules/testing-and-verification.md: "hand-checked
// geometries in the analysis projection with known areas and buffer overlaps"). Every shape is built in
// planar coordinates (EPSG:2926, US survey feet), so its true size is known by construction: a 1000 ft
// square is 1,000,000 sq ft. The study area is a 10,000 ft square from (1,350,000, 220,000). The
// illustrative profile gives wetlands and habitat a 100 ft buffer and trigger, streams 75 ft, migration
// corridors and geologically hazardous areas 50 ft, and forest canopy a 0 ft trigger.

const SA = { x: 1_350_000, y: 220_000, size: 10_000 };
const rect = (x: number, y: number, w: number, h: number) =>
  `MULTIPOLYGON(((${x} ${y}, ${x + w} ${y}, ${x + w} ${y + h}, ${x} ${y + h}, ${x} ${y})))`;
const line = (x1: number, y1: number, x2: number, y2: number) => `LINESTRING(${x1} ${y1}, ${x2} ${y2})`;
const near = (actual: number | null, expected: number, tolerance = 0.5) => {
  expect(actual).not.toBeNull();
  expect(Math.abs((actual ?? Number.NaN) - expected)).toBeLessThan(tolerance);
};

let city: City;
let pinned: PinnedInputs;

beforeAll(async () => {
  city = await createReadyCity({ sampleEvidence: false });

  // A polygon fully inside the study area.
  await addEvidence(city, { resourceTypeKey: "wetlands", feature: await planarGeometry(rect(1_354_000, 224_000, 1000, 1000)) });
  // A line fully inside.
  await addEvidence(city, { resourceTypeKey: "streams", feature: await planarGeometry(line(1_354_000, 222_000, 1_354_000, 222_500)) });
  // A line 30 ft off the site's west edge, inside migration corridors' 50 ft buffer.
  await addEvidence(city, { resourceTypeKey: "migration-corridors", feature: await planarGeometry(line(SA.x - 30, 225_000, SA.x - 30, 226_000)) });
  // A polygon 650 ft off the site, beyond habitat conservation areas' 100 ft search distance.
  await addEvidence(city, { resourceTypeKey: "habitat-conservation-areas", feature: await planarGeometry(rect(SA.x - 700, 225_000, 100, 100)) });
  // A dataset whose coverage is nowhere near the study area (F14 R7).
  await addEvidence(city, {
    resourceTypeKey: "frequently-flooded-areas",
    feature: await planarGeometry(rect(1_354_000, 224_000, 100, 100)),
    coverage: await planarGeometry(rect(1_000_000, 100_000, 1000, 1000)),
  });

  const planner = await createPerson();
  const project = await createDecision(planner.actor, { jurisdictionId: city.id, title: "Golden scene", applicationType: "subdivision" });
  await saveGeometry(planner.actor, project.id, "study_area", await planarGeometry(rect(SA.x, SA.y, SA.size, SA.size)), "Golden study area", 1);

  const pin = await pinInputs(project.id, "current");
  if (pin.kind !== "ready") throw new Error(`the golden scene didn't pin: ${pin.kind}`);
  pinned = pin.pinned;
});

async function screening() {
  return computeScreening(pinned.rules, pinned.mappings, pinned.studyArea.geom, 2926);
}
const rowFor = async (resourceType: string) => (await screening()).find((r) => r.resourceType === resourceType);

describe("R1: the register states how much of each mapped dataset is inside the study area", () => {
  it("R1: a 1000 ft square inside the study area is exactly 1,000,000 sq ft, at distance 0", async () => {
    const row = await rowFor("wetlands");
    expect(row?.intersectingFeatureCount).toBe(1);
    near(row?.overlapAreaSqFt ?? Number.NaN, 1_000_000);
    expect(row?.overlapLengthFt).toBe(0);
    expect(row?.nearestDistanceFt).toBe(0);
  });

  it("R1: a 500 ft line inside the study area is 500 ft long", async () => {
    const row = await rowFor("streams");
    expect(row?.intersectingFeatureCount).toBe(1);
    near(row?.overlapLengthFt ?? Number.NaN, 500, 0.01);
    expect(row?.overlapAreaSqFt).toBe(0);
  });

  it("R1: a dataset with nothing inside is a measured zero, not a missing row", async () => {
    const row = await rowFor("migration-corridors");
    expect(row?.intersectingFeatureCount).toBe(0);
    expect(row?.overlapAreaSqFt).toBe(0);
    expect(row?.overlapLengthFt).toBe(0);
  });
});

describe("R2/R3: what is just off the site, and how far the search went", () => {
  it("R2: a feature 30 ft off the site is found, at its true distance, and its buffer is reported as reaching the site", async () => {
    const row = await rowFor("migration-corridors");
    near(row?.nearestDistanceFt ?? Number.NaN, 30);
    expect(row?.searchedWithinFt).toBe(50);
    expect(row?.bufferReaches).toEqual([{ ruleKey: "migration-corridors-buffer", applicability: "yes", featureCount: 1 }]);
  });

  it("R3: nothing within the search distance gives null — never 0 — and the sentence says how far it looked", async () => {
    const row = await rowFor("habitat-conservation-areas");
    expect(row?.searchedWithinFt).toBe(100);
    expect(row?.nearestDistanceFt).toBeNull();
    expect(row?.bufferReaches).toEqual([]);
    expect(describeScreeningRow(row ?? failRow())).toContain("None mapped within 100 ft.");
  });

  it("R4: a buffer whose applicability depends on an attribute the evidence lacks is 'unknown', never assumed", async () => {
    const rules = {
      ...pinned.rules,
      bufferRules: pinned.rules.bufferRules.map((b) =>
        b.resourceType === "migration-corridors"
          ? { ...b, appliesWhen: { attribute: "rating", equals: "I" } }
          : b,
      ),
    };
    const rows = await computeScreening(rules, pinned.mappings, pinned.studyArea.geom, 2926);
    const row = rows.find((r) => r.resourceType === "migration-corridors");
    expect(row?.bufferReaches).toEqual([{ ruleKey: "migration-corridors-buffer", applicability: "unknown", featureCount: 1 }]);
    expect(describeScreeningRow(row ?? failRow())).toContain("may reach onto it");
  });

  it("R7: a dataset whose coverage excludes the study area is a gap, and has no register row", async () => {
    expect((await screening()).some((r) => r.resourceType === "frequently-flooded-areas")).toBe(false);
    const base = await buildEvidenceBase(pinned.rules.resourceTypes, pinned.mappings, pinned.studyArea.geom, 2926);
    expect(base.gaps).toContainEqual({ resourceType: "frequently-flooded-areas", reason: "coverage-excludes-study-area" });
  });

  it("R8: a resource type the profile marks approximate says so and says a site study sets the boundary", async () => {
    const row = await rowFor("migration-corridors");
    expect(row?.approximate).toBe(true);
    expect(describeScreeningRow(row ?? failRow())).toContain("a site study sets the regulated boundary");
    expect((await rowFor("wetlands"))?.approximate).toBe(false);
  });
});

describe("R5/R6: a study flag is a fact about mapped data, and its absence is never a waiver", () => {
  it("R5: a trigger met by mapped data is flagged, with the study, the exact distance, and the evidence behind it", async () => {
    const flags = await computeStudyFlags(pinned.rules, pinned.mappings, pinned.studyArea.geom, 2926);
    const corridor = flags.find((f) => f.triggerKey === "migration-corridors-study");
    expect(corridor?.study).toBe("critical-area-study");
    near(corridor?.nearestDistanceFt ?? Number.NaN, 30);
    expect(corridor?.evidence).toHaveLength(1);
    expect(corridor?.approximate).toBe(true);
    const wetlands = flags.find((f) => f.triggerKey === "wetlands-study");
    expect(wetlands?.nearestDistanceFt).toBe(0);
    expect(wetlands?.approximate).toBe(false);
  });

  it("R6: a trigger the mapped data doesn't meet produces no flag (and so no claim either way)", async () => {
    const flags = await computeStudyFlags(pinned.rules, pinned.mappings, pinned.studyArea.geom, 2926);
    expect(flags.some((f) => f.triggerKey === "habitat-conservation-areas-study")).toBe(false); // 650 ft away, beyond 100 ft
    expect(flags.some((f) => f.triggerKey === "geologically-hazardous-areas-study")).toBe(false); // nothing mapped
  });
});

describe("R11/R13: screening needs no footprint, and the same inputs give byte-identical results", () => {
  it("R11: this scene has no footprint at all, and it still has a register and flags", async () => {
    expect(pinned.footprint).toBeNull();
    expect((await screening()).length).toBeGreaterThan(0);
  });

  it("R13: computing twice from the same pinned inputs is byte-identical", async () => {
    const first = JSON.stringify([await screening(), await computeStudyFlags(pinned.rules, pinned.mappings, pinned.studyArea.geom, 2926)]);
    const second = JSON.stringify([await screening(), await computeStudyFlags(pinned.rules, pinned.mappings, pinned.studyArea.geom, 2926)]);
    expect(first).toBe(second);
  });
});

function failRow(): never {
  throw new Error("expected a screening row for this resource type");
}
