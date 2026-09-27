import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";

import { getActor, provisionUser, type Actor } from "@/modules/accounts";
import { runAnalysis } from "@/modules/analysis";
import { createSampleProject, type Decision } from "@/modules/decisions";
import { createDataset, installSampleEvidence, mapToJurisdiction } from "@/modules/evidence";
import {
  buildSampleProfileDocument,
  SAMPLE_PROFILE_REASON,
  createJurisdiction,
  decideChange,
  proposeEdit,
  type ProfileDocument,
} from "@/modules/profiles";
import { db } from "@/platform/db";

// Test data factories for the integration tests (.claude/rules/testing-and-verification.md: "Every test
// creates its own data, and none depends on another test's state or order"). Everything goes through the
// modules' own public functions, so the fixtures exercise the same paths production uses. Names and
// emails are unique per call, and no test counts rows it didn't create.

export type Person = { userId: string; actor: Actor };

export async function createPerson(options: { staff?: boolean } = {}): Promise<Person> {
  const authId = randomUUID();
  const userId = await provisionUser(db, {
    authId,
    email: `${authId}@example.test`,
    name: `Test Person ${authId.slice(0, 8)}`,
  });
  if (options.staff) {
    // An operator creates staff rights (accounts-roles.md R4): there is no module function for it.
    await db.execute(sql`insert into staff_member (user_id, granted_by) values (${userId}, ${userId})`);
  }
  return { userId, actor: await getActor(db, userId) };
}

const SQUARE = {
  type: "MultiPolygon" as const,
  coordinates: [
    [
      [
        [-122.06, 47.55],
        [-121.96, 47.55],
        [-121.96, 47.65],
        [-122.06, 47.65],
        [-122.06, 47.55],
      ],
    ],
  ],
};

export type City = { id: string; name: string; staff: Person; approver: Person };

/**
 * A city with an approved profile (the illustrative one unless `profile` says otherwise) and, unless
 * `sampleEvidence` is false, the illustrative evidence datasets mapped to it: what the sample project
 * needs. `profile: null` leaves the city with none. The profile goes through the real
 * propose-and-approve flow, with two people (a change can't be approved by the person who proposed it).
 */
export async function createReadyCity(
  options: { profile?: ProfileDocument | null; sampleEvidence?: boolean } = {},
): Promise<City> {
  const staff = await createPerson({ staff: true });
  const approver = await createPerson({ staff: true });
  const city = await createJurisdiction(staff.actor, {
    name: `Test City ${randomUUID().slice(0, 8)}`,
    stateCode: "WA",
    timeZone: "America/Los_Angeles",
    analysisSrid: 2926,
    boundary: SQUARE,
  });
  if (options.profile !== null) {
    const change = await proposeEdit(
      staff.actor,
      city.id,
      options.profile ?? buildSampleProfileDocument(),
      SAMPLE_PROFILE_REASON,
    );
    await decideChange(approver.actor, change.id, "approved", "Test fixture.");
  }
  if (options.sampleEvidence !== false) await installSampleEvidence(staff.actor, city.id);
  return { id: city.id, name: city.name, staff, approver };
}

/** A GeoJSON geometry from planar coordinates in the analysis projection (EPSG:2926, US survey feet), so a test can state a shape's true size. */
export async function planarGeometry(wkt: string): Promise<GeoJSON.Geometry> {
  const result = await db.execute<{ geojson: string }>(
    sql`select ST_AsGeoJSON(ST_Transform(ST_GeomFromText(${wkt}, 2926), 4326)) as geojson`,
  );
  const row = result.rows[0];
  if (!row) throw new Error("ST_AsGeoJSON returned no row");
  return JSON.parse(row.geojson) as GeoJSON.Geometry;
}

/**
 * Adds one dataset with one feature to a city, mapped to a resource type — the way ingestion leaves it
 * (a ready version whose id is the dataset's current version), without GDAL, which isn't installed
 * everywhere. Used to build a scene whose numbers are known by construction.
 */
export async function addEvidence(
  city: City,
  input: {
    resourceTypeKey: string;
    feature: GeoJSON.Geometry;
    attributes?: Record<string, unknown>;
    coverage?: GeoJSON.Geometry;
    attributeMap?: Record<string, string>;
    knownLimitation?: string | null;
  },
): Promise<{ datasetId: string; versionId: string }> {
  const key = `test-${randomUUID()}`;
  const created = await createDataset(city.staff.actor, {
    key,
    title: `Test dataset ${key.slice(5, 13)}`,
    publisher: "Test publisher",
    license: "Public domain",
    sourceUrl: "https://example.test/data",
    authority: "county",
    spatialPrecision: "site",
    coverage:
      input.coverage ??
      (await planarGeometry("MULTIPOLYGON(((1000000 100000, 1700000 100000, 1700000 500000, 1000000 500000, 1000000 100000)))")),
    knownLimitation: input.knownLimitation ?? null,
    confidenceDefault: "moderate",
    confidenceRationaleDefault: "Test fixture.",
  });
  const version = await db.execute<{ id: string }>(sql`
    insert into dataset_version
      (dataset_id, status, raw_object_key, raw_sha256, retrieved_at, source_as_of, confidence, confidence_rationale, processing_steps, feature_count)
    values (${created.id}, 'ready', ${`test/${key}`}, ${randomUUID()}, now(), '2024-01-01', 'moderate', 'Test fixture.', '[]'::jsonb, 1)
    returning id`);
  const versionId = version.rows[0]?.id;
  if (!versionId) throw new Error("dataset_version insert returned no row");
  await db.execute(sql`
    insert into evidence_feature (dataset_version_id, source_feature_id, geom, attributes)
    values (${versionId}, 'f1', ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(input.feature)}), 4326), ${JSON.stringify(input.attributes ?? {})}::jsonb)`);
  await db.execute(sql`update dataset set current_version_id = ${versionId} where id = ${created.id}`);
  await mapToJurisdiction(city.staff.actor, city.id, created.id, input.resourceTypeKey, input.attributeMap ?? {});
  return { datasetId: created.id, versionId };
}

/** A sample project (details, study area, footprint) whose analysis has run, so every phase has output. */
export async function createAnalyzedSampleProject(planner: Person, city: City): Promise<Decision> {
  const decision = await createSampleProject(planner.actor, city.id);
  await runAnalysis(decision.id, "current");
  return decision;
}
