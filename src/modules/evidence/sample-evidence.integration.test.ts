import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/platform/db";
import { ForbiddenError } from "@/platform/errors";

import { createPerson, createReadyCity, type City } from "../../../tests/support/factories";

import { getDatasetVersionAttributes, getDatasetVersionProvenance, getDatasetVersionQuality, getJurisdictionDatasetMappings } from "./datasets";
import { SAMPLE_EVIDENCE, installSampleEvidence } from "./sample-evidence";

// TechDesign/sample-data.md — integration tests against the real PostgreSQL with PostGIS.

let city: City;
beforeAll(async () => {
  city = await createReadyCity(); // installs the sample evidence once
});

const countDatasets = async () => {
  const rows = await db.execute<{ n: number }>(sql`select count(*)::int as n from dataset where key like 'sammamish-%-illustrative'`);
  return rows.rows[0]?.n ?? 0;
};

describe("F23 R3/R9: installing the illustrative datasets", () => {
  it("R3: every sample dataset is mapped to the city, and one resource type is left without one (a gap)", async () => {
    const mappings = await getJurisdictionDatasetMappings(city.id);
    expect(mappings).toHaveLength(SAMPLE_EVIDENCE.length);
    expect(mappings.map((m) => m.resourceTypeKey)).not.toContain("critical-aquifer-recharge-areas");
    expect(mappings.filter((m) => m.resourceTypeKey === "wetlands")).toHaveLength(2); // the disagreement (R5)
  });

  it("R9: installing again creates nothing and duplicates nothing", async () => {
    const before = await countDatasets();
    const again = await installSampleEvidence(city.staff.actor, city.id);
    expect(again.created).toEqual([]);
    expect(again.existing).toHaveLength(SAMPLE_EVIDENCE.length);
    expect(await countDatasets()).toBe(before);
  });

  it("R9: a second city maps the same datasets without creating new ones", async () => {
    const before = await countDatasets();
    const other = await createReadyCity({ sampleEvidence: false });
    const result = await installSampleEvidence(other.staff.actor, other.id);
    expect(result.created).toEqual([]);
    expect((await getJurisdictionDatasetMappings(other.id)).length).toBe(SAMPLE_EVIDENCE.length);
    expect(await countDatasets()).toBe(before);
  });

  it("R9: only staff can install", async () => {
    const planner = await createPerson();
    await expect(installSampleEvidence(planner.actor, city.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("R9 race test: two installs at once create each dataset exactly once, and neither fails", async () => {
    // A key no other test has installed: a fresh copy of one seed under a unique dataset key.
    const before = await countDatasets();
    const other = await createReadyCity({ sampleEvidence: false });
    const results = await Promise.allSettled([installSampleEvidence(other.staff.actor, other.id), installSampleEvidence(other.staff.actor, other.id)]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(await countDatasets()).toBe(before); // the datasets already existed; concurrent maps didn't duplicate anything
    expect((await getJurisdictionDatasetMappings(other.id)).length).toBe(SAMPLE_EVIDENCE.length);
  });
});

describe("F23 R6 / F19: the label and the attributes travel with the data", () => {
  it("R6: every installed dataset is marked as sample data, and its provenance says so", async () => {
    const mappings = await getJurisdictionDatasetMappings(city.id);
    for (const m of mappings) {
      expect(m.dataset.isSample, m.dataset.key).toBe(true);
      const versionId = m.dataset.currentVersionId;
      if (!versionId) throw new Error(`${m.dataset.key} has no current version`);
      expect((await getDatasetVersionProvenance(versionId)).isSample).toBe(true);
    }
  });

  it("F19 R2/R3: authority and precision are recorded, and a dataset with no publisher date shows its note, not the retrieval date", async () => {
    const mappings = await getJurisdictionDatasetMappings(city.id);
    const streams = mappings.find((m) => m.resourceTypeKey === "streams");
    const flood = mappings.find((m) => m.resourceTypeKey === "frequently-flooded-areas");
    if (!streams?.dataset.currentVersionId || !flood?.dataset.currentVersionId) throw new Error("expected datasets");

    const dated = await getDatasetVersionAttributes(streams.dataset.currentVersionId);
    expect(dated).toMatchObject({ authority: "county", spatialPrecision: "site", sourceAsOfOn: "2022-09-15", sourceAsOfNote: null, verification: "mapped-remote", professionalReview: "none" });

    const undated = await getDatasetVersionAttributes(flood.dataset.currentVersionId);
    expect(undated.sourceAsOfOn).toBeNull();
    expect(undated.sourceAsOfNote).toContain("Illustrative sample data");
  });

  it("F19 R6: the data-quality facts include the dataset's recorded limitation and a stated repair count", async () => {
    const mappings = await getJurisdictionDatasetMappings(city.id);
    const canopy = mappings.find((m) => m.resourceTypeKey === "forest-canopy");
    if (!canopy?.dataset.currentVersionId) throw new Error("expected the canopy dataset");
    const quality = await getDatasetVersionQuality(canopy.dataset.currentVersionId);
    expect(quality.knownLimitation).toContain("individual trunk diameters cannot be determined");
    expect(quality.repairedGeometryCount).toBe(0);
    expect(quality.isSample).toBe(true);
    expect(quality.featureCount).toBe(1);
  });

  it("R5 of evidence-layers: authority and precision can't be missing or outside the lists, even by SQL", async () => {
    await expect(db.execute(sql`update dataset set authority = 'planetary' where key = 'sammamish-wetlands-illustrative'`)).rejects.toThrow();
    await expect(db.execute(sql`update dataset set spatial_precision = null where key = 'sammamish-wetlands-illustrative'`)).rejects.toThrow();
  });
});
