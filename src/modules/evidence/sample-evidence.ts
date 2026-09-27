import { createHash } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import type { Geometry, MultiPolygon } from "geojson";

import { requireStaff, type Actor } from "@/modules/accounts";
import { db } from "@/platform/db";
import { ValidationError } from "@/platform/errors";

import { dataset, datasetVersion, evidenceFeature, jurisdictionDataset } from "./tables";

// TechDesign/sample-data.md (F23): the illustrative evidence datasets. They are ordinary datasets,
// versions, and features — what marks them as sample is `dataset.is_sample`, which the provenance
// formatter turns into a label on every figure that comes from them (evidence-layers.md R13). The
// analysis never reads that mark (sample-data.md R4).
//
// Every shape is hand-placed relative to the sample study area and footprint in
// `decisions/sample-data.ts` (a rectangle from [-122.03, 47.59] to [-121.99, 47.62], and a footprint
// from [-122.02, 47.595] to [-122.00, 47.61]), so that each phase has something to show (R5):
//  - wetlands sits inside the footprint (a direct impact) and has a SECOND, disagreeing dataset whose
//    extent only partly overlaps the first — a real source disagreement (F7 R3), not a fabricated one.
//  - streams, geologically hazardous areas, habitat conservation areas, and migration corridors each
//    sit inside or within their profile buffer width of the footprint, so Impact shows direct AND
//    buffer impacts across most resource types, computed by PostGIS.
//  - frequently flooded areas sit inside the study area, away from the footprint: real evidence with no
//    overlap — an honest fact about the mapped data, not a clearance.
//  - forest canopy sits about 2,000 ft west of the study area, outside the arborist study's 0 ft trigger
//    distance, so the Studies phase shows a study that mapped data does NOT flag, next to the P2
//    statement that this is not a waiver (R5).
//  - critical aquifer recharge areas has no dataset at all: a genuine "no dataset mapped" gap (F7 R4).
// Each polygon is a right-angle shape with a step or notch, closer to a real delineation than a
// rectangle, and a simple (non-self-intersecting) ring; `installSampleEvidence` checks this with
// PostGIS before inserting, since `evidence_feature` has no gate of its own (ingested evidence is
// repaired rather than rejected — only a planner's own drawing is ever rejected).

const CAO_URL = "https://www.sammamish.us/projects/critical-areas-ordinance-cao-update/";
const TREES_URL = "https://www.sammamish.us/government/community-development/permit-center/trees/";

// A rough bounding box around the pilot area, not a surveyed extent.
const SAMPLE_COVERAGE: MultiPolygon = {
  type: "MultiPolygon",
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

export type SampleDataset = {
  datasetKey: string; // always `sammamish-<name>-illustrative`; migration 0003 relies on the shape
  resourceTypeKey: string; // a resourceTypes[].key in the Sammamish profile
  title: string;
  sourceUrl: string;
  authority: "federal" | "state" | "regional" | "county" | "local";
  spatialPrecision: "site" | "parcel" | "regional" | "coarse";
  /** An illustrative publisher date, or null. Sample-labeled wherever it is shown. */
  sourceAsOf: string | null;
  knownLimitation: string | null;
  feature: Geometry;
};

export const SAMPLE_EVIDENCE: SampleDataset[] = [
  {
    datasetKey: "sammamish-wetlands-illustrative",
    resourceTypeKey: "wetlands",
    title: "Wetlands (illustrative)",
    sourceUrl: CAO_URL,
    authority: "federal",
    spatialPrecision: "parcel",
    sourceAsOf: "2019-05-01",
    knownLimitation: null,
    // An L-shape (wide at the bottom, narrower at the top) inside the footprint — a direct impact.
    feature: {
      type: "Polygon",
      coordinates: [
        [
          [-122.015, 47.598],
          [-122.005, 47.598],
          [-122.005, 47.601],
          [-122.01, 47.601],
          [-122.01, 47.604],
          [-122.015, 47.604],
          [-122.015, 47.598],
        ],
      ],
    },
  },
  {
    datasetKey: "sammamish-wetlands-alt-illustrative",
    resourceTypeKey: "wetlands",
    title: "Wetlands, alternate source (illustrative)",
    sourceUrl: CAO_URL,
    authority: "state",
    spatialPrecision: "regional",
    sourceAsOf: null,
    knownLimitation: null,
    // A different step shape, shifted west of the first: a partial overlap (agreement in the middle,
    // disagreement on the outer slivers), not an offset copy of the same rectangle.
    feature: {
      type: "Polygon",
      coordinates: [
        [
          [-122.02, 47.598],
          [-122.012, 47.598],
          [-122.012, 47.602],
          [-122.01, 47.602],
          [-122.01, 47.604],
          [-122.02, 47.604],
          [-122.02, 47.598],
        ],
      ],
    },
  },
  {
    datasetKey: "sammamish-streams-illustrative",
    resourceTypeKey: "streams",
    title: "Streams (illustrative)",
    sourceUrl: CAO_URL,
    authority: "county",
    spatialPrecision: "site",
    sourceAsOf: "2022-09-15",
    knownLimitation: null,
    // A real stream never runs perfectly straight: a small right-angle jog, within its buffer of the
    // footprint's west edge for its full length.
    feature: {
      type: "LineString",
      coordinates: [
        [-122.0201, 47.6],
        [-122.0201, 47.602],
        [-122.0204, 47.602],
        [-122.0204, 47.605],
        [-122.0201, 47.605],
        [-122.0201, 47.61],
      ],
    },
  },
  {
    datasetKey: "sammamish-frequently-flooded-areas-illustrative",
    resourceTypeKey: "frequently-flooded-areas",
    title: "Frequently flooded areas (illustrative)",
    sourceUrl: CAO_URL,
    authority: "federal",
    spatialPrecision: "regional",
    sourceAsOf: null,
    knownLimitation: null,
    feature: {
      type: "Polygon",
      coordinates: [
        [
          [-121.998, 47.6],
          [-121.995, 47.6],
          [-121.995, 47.602],
          [-121.994, 47.602],
          [-121.994, 47.604],
          [-121.998, 47.604],
          [-121.998, 47.6],
        ],
      ],
    },
  },
  {
    datasetKey: "sammamish-geologically-hazardous-areas-illustrative",
    resourceTypeKey: "geologically-hazardous-areas",
    title: "Geologically hazardous areas (illustrative)",
    sourceUrl: CAO_URL,
    authority: "state",
    spatialPrecision: "regional",
    sourceAsOf: null,
    knownLimitation: null,
    // Straddles the footprint's north edge (lat 47.61): a direct impact, as a step shape.
    feature: {
      type: "Polygon",
      coordinates: [
        [
          [-122.015, 47.605],
          [-122.008, 47.605],
          [-122.008, 47.61],
          [-122.005, 47.61],
          [-122.005, 47.615],
          [-122.015, 47.615],
          [-122.015, 47.605],
        ],
      ],
    },
  },
  {
    datasetKey: "sammamish-habitat-conservation-areas-illustrative",
    resourceTypeKey: "habitat-conservation-areas",
    title: "Habitat conservation areas (illustrative)",
    sourceUrl: CAO_URL,
    authority: "state",
    spatialPrecision: "coarse",
    sourceAsOf: null,
    knownLimitation: null,
    // About 25 ft east of the footprint's east edge (lon -122.00), inside its 100 ft buffer.
    feature: {
      type: "Polygon",
      coordinates: [
        [
          [-121.9999, 47.6],
          [-121.997, 47.6],
          [-121.997, 47.602],
          [-121.996, 47.602],
          [-121.996, 47.605],
          [-121.9999, 47.605],
          [-121.9999, 47.6],
        ],
      ],
    },
  },
  {
    datasetKey: "sammamish-migration-corridors-illustrative",
    resourceTypeKey: "migration-corridors",
    title: "Migration corridors (illustrative)",
    sourceUrl: CAO_URL,
    authority: "regional",
    spatialPrecision: "coarse",
    sourceAsOf: null,
    knownLimitation: null,
    // A small right-angle jog, most of it about 35 ft south of the footprint's south edge
    // (lat 47.595), inside its 50 ft buffer.
    feature: {
      type: "LineString",
      coordinates: [
        [-122.03, 47.5949],
        [-122.02, 47.5949],
        [-122.02, 47.5946],
        [-122.015, 47.5946],
        [-122.015, 47.5949],
        [-121.99, 47.5949],
      ],
    },
  },
  {
    datasetKey: "sammamish-forest-canopy-illustrative",
    resourceTypeKey: "forest-canopy",
    title: "Forest canopy extent (illustrative)",
    sourceUrl: TREES_URL,
    authority: "regional",
    spatialPrecision: "coarse",
    sourceAsOf: "2021-08-01",
    knownLimitation:
      'Canopy extent only, from remote sensing — individual trunk diameters cannot be determined from this data (charter: "Known limits of desk analysis").',
    feature: {
      type: "Polygon",
      coordinates: [
        [
          [-122.045, 47.606],
          [-122.041, 47.606],
          [-122.041, 47.609],
          [-122.039, 47.609],
          [-122.039, 47.612],
          [-122.045, 47.612],
          [-122.045, 47.606],
        ],
      ],
    },
  },
];

const SAMPLE_RATIONALE =
  "Illustrative sample data seeded for demonstration — not a real ingested dataset. Do not use this figure or its rationale in an actual decision.";

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Creates the illustrative datasets that don't exist yet and maps every one to the jurisdiction
 * (sample-data.md R3, R9). Staff only, and create-if-missing: it never overwrites or deletes, and
 * two calls at once create each dataset once — the dataset key is unique, and a second insert waits
 * for the first to commit and then does nothing.
 */
export async function installSampleEvidence(
  actor: Actor,
  jurisdictionId: string,
): Promise<{ created: string[]; existing: string[] }> {
  requireStaff(actor);

  return db.transaction(async (tx) => {
    const created: string[] = [];
    const existing: string[] = [];

    for (const seed of SAMPLE_EVIDENCE) {
      const [validity] = await tx
        .execute<{ valid: boolean; reason: string }>(
          sql`
            select ST_IsValid(ST_GeomFromGeoJSON(${JSON.stringify(seed.feature)})) as valid,
                   ST_IsValidReason(ST_GeomFromGeoJSON(${JSON.stringify(seed.feature)})) as reason
          `,
        )
        .then((r) => r.rows);
      if (!validity?.valid) {
        throw new ValidationError(`sample feature for "${seed.datasetKey}" is not a valid geometry: ${validity?.reason}`);
      }

      const [inserted] = await tx
        .insert(dataset)
        .values({
          key: seed.datasetKey,
          title: seed.title,
          publisher: "City of Sammamish (illustrative test data)",
          license: "Public domain",
          sourceUrl: seed.sourceUrl,
          authority: seed.authority,
          spatialPrecision: seed.spatialPrecision,
          isSample: true,
          coverage: SAMPLE_COVERAGE,
          knownLimitation: seed.knownLimitation,
          confidenceDefault: "moderate",
          confidenceRationaleDefault: SAMPLE_RATIONALE,
        })
        .onConflictDoNothing({ target: dataset.key })
        .returning({ id: dataset.id });

      let datasetId: string;
      if (inserted) {
        datasetId = inserted.id;
        const [version] = await tx
          .insert(datasetVersion)
          .values({
            datasetId,
            status: "ready",
            rawObjectKey: `evidence-raw/sample/${seed.datasetKey}.geojson`, // no object exists: inserted directly, not ingested
            rawSha256: sha256(JSON.stringify(seed.feature)),
            retrievedAt: sql`now()`,
            sourceAsOf: seed.sourceAsOf,
            sourceAsOfNote: seed.sourceAsOf
              ? null
              : "Illustrative sample data — not a real publisher release.",
            confidence: "moderate",
            confidenceRationale: SAMPLE_RATIONALE,
            processingSteps: [{ step: "sample", note: "inserted directly, not ingested" }],
            featureCount: 1,
          })
          .returning({ id: datasetVersion.id });
        if (!version) throw new Error("insert into dataset_version unexpectedly returned no row");
        await tx.insert(evidenceFeature).values({
          datasetVersionId: version.id,
          sourceFeatureId: "sample-1",
          geom: seed.feature,
          attributes: { note: "illustrative sample feature" },
        });
        await tx.update(dataset).set({ currentVersionId: version.id }).where(eq(dataset.id, datasetId));
        created.push(seed.datasetKey);
      } else {
        const [found] = await tx.select({ id: dataset.id }).from(dataset).where(eq(dataset.key, seed.datasetKey));
        if (!found) throw new Error(`dataset ${seed.datasetKey} conflicted on its key but could not be read back`);
        datasetId = found.id;
        existing.push(seed.datasetKey);
      }

      await tx
        .insert(jurisdictionDataset)
        .values({ jurisdictionId, datasetId, resourceTypeKey: seed.resourceTypeKey, attributeMap: {} })
        .onConflictDoUpdate({
          target: [jurisdictionDataset.jurisdictionId, jurisdictionDataset.datasetId],
          set: { resourceTypeKey: seed.resourceTypeKey, attributeMap: {} },
        });
    }
    return { created, existing };
  });
}
