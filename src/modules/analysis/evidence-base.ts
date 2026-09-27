import { sql } from "drizzle-orm";

import type { JurisdictionDatasetMapping } from "@/modules/evidence";
import { db } from "@/platform/db";
import type { ResourceType } from "@/modules/profiles";

import { coverageReachesStudyArea } from "./coverage";
import type { Disagreement, Gap, Limit } from "./results";

// TechDesign/evidence-base.md — buildEvidenceBase. R1: every resource type in the resolved
// profile. R3: disagreements are always pairwise and symmetric, never a "winner". R4: a gap is a
// distinct fact from an honest empty result. R6: the only inputs are evidence_feature rows reached
// through jurisdiction_dataset mappings — there is no parameter through which an applicant file
// could enter.

// A mapping whose dataset has a ready version to compare — the only shape the queries below need.
type ReadyMapping = JurisdictionDatasetMapping & { dataset: { currentVersionId: string } };

function hasReadyVersion(m: JurisdictionDatasetMapping): m is ReadyMapping {
  return m.dataset.currentVersionId !== null;
}

export async function buildEvidenceBase(
  resourceTypes: ResourceType[],
  mappings: JurisdictionDatasetMapping[],
  studyAreaGeom: GeoJSON.Geometry,
  analysisSrid: number, // the jurisdiction's own projection (EPSG:2926 for Sammamish) — never hardcoded
): Promise<{ disagreements: Disagreement[]; gaps: Gap[] }> {
  const disagreements: Disagreement[] = [];
  const gaps: Gap[] = [];
  const studyAreaJson = JSON.stringify(studyAreaGeom);

  for (const resourceType of resourceTypes) {
    // R4: only a dataset with a ready version is usable evidence; one still ingesting is the
    // same as none mapped yet, from this decision's point of view.
    const mapped = mappings.filter((m) => m.resourceTypeKey === resourceType.key).filter(hasReadyVersion);
    if (mapped.length === 0) {
      gaps.push({ resourceType: resourceType.key, reason: "no-dataset-mapped" }); // R4
      continue;
    }

    const coverageChecks = await Promise.all(
      mapped.map(async (m) => ({
        mapping: m,
        intersects: await coverageReachesStudyArea(m.dataset.coverage, studyAreaGeom),
      })),
    );
    const inCoverage = coverageChecks.filter((c) => c.intersects).map((c) => c.mapping);
    if (inCoverage.length === 0) {
      gaps.push({ resourceType: resourceType.key, reason: "coverage-excludes-study-area" }); // R4
      continue;
    }

    // R3: pairwise and symmetric, never a "winner" — compare every ordered pair by identity, not
    // index, so nothing here needs a non-null assertion on an indexed array access.
    for (const a of inCoverage) {
      for (const b of inCoverage) {
        if (a === b) continue;
        const [row] = await db
          .execute<{ area: number }>(
            sql`
              -- ::int: ST_Transform also has a (geometry, text) overload (a raw proj4/WKT string,
              -- not an SRID) that an untyped bound parameter can resolve to — see impact.ts's note.
              select ST_Area(ST_Transform(ST_Intersection(
                (select ST_Union(geom) from evidence_feature where dataset_version_id = ${a.dataset.currentVersionId}),
                ST_Difference(
                  ST_SetSRID(ST_GeomFromGeoJSON(${studyAreaJson}), 4326),
                  (select ST_Union(geom) from evidence_feature where dataset_version_id = ${b.dataset.currentVersionId})
                )
              ), ${analysisSrid}::int)) as area
            `,
          )
          .then((r) => r.rows);
        const area = row?.area ?? 0;
        if (area > 0) {
          disagreements.push({
            resourceType: resourceType.key,
            mappedBy: a.dataset.currentVersionId,
            notMappedBy: b.dataset.currentVersionId,
            area,
            unit: "us-survey-sq-ft",
          });
        }
      }
    }
  }

  return { disagreements, gaps };
}

/**
 * R7 of evidence-base.md: surfaces what is already recorded — never invents a new limit. Three facts,
 * each keyed and worded later by limit-text.ts: the charter's significant-trees limit, each resource
 * type the profile marks approximate (a site study sets its boundary), and each mapped dataset's own
 * recorded limitation (F3 R10).
 */
export function collectLimits(
  mappings: JurisdictionDatasetMapping[],
  resourceTypes: ResourceType[],
): Limit[] {
  const limits: Limit[] = [];
  if (resourceTypes.some((r) => r.key === "forest-canopy")) {
    limits.push({ key: "significant-trees-not-countable", resourceType: "forest-canopy", datasetVersionId: null }); // R5 of impact-analysis.md
  }
  for (const resourceType of resourceTypes) {
    if (resourceType.mapStatus === "approximate") {
      limits.push({ key: "boundary-set-by-site-study", resourceType: resourceType.key, datasetVersionId: null });
    }
  }
  for (const m of mappings) {
    if (m.dataset.knownLimitation && m.dataset.currentVersionId) {
      limits.push({ key: "dataset-limitation", resourceType: m.resourceTypeKey, datasetVersionId: m.dataset.currentVersionId });
    }
  }
  return limits;
}
