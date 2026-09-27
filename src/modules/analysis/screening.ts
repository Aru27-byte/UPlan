import { sql } from "drizzle-orm";
import type { Geometry } from "geojson";

import type { JurisdictionDatasetMapping } from "@/modules/evidence";
import type { InForceRules } from "@/modules/profiles";
import { db } from "@/platform/db";
import { ValidationError } from "@/platform/errors";

import { coverageReachesStudyArea } from "./coverage";
import { evaluateAppliesWhen } from "./impact";
import { sortScreening, type ScreeningRow, type StudyFlag } from "./results";

// TechDesign/study-scoping.md (F14). Screening and study flags are two more sections of the same
// AnalysisResults, computed by the same run_analysis job from the same pinned inputs, from the study
// area alone: they exist before any footprint does (R11). R13: every number is PostGIS's, in the
// jurisdiction's analysis projection; JavaScript only compares two PostGIS-computed distances and
// counts rows. Every `srid` is cast `::int` (see impact.ts's note on ST_Transform's overloads).

type ReadyMapping = JurisdictionDatasetMapping & { dataset: { currentVersionId: string } };

function isReady(m: JurisdictionDatasetMapping): m is ReadyMapping {
  return m.dataset.currentVersionId !== null;
}

function studyAreaSql(studyAreaGeom: Geometry) {
  return sql`ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(studyAreaGeom)}), 4326)`;
}

/** R3: the widest of a resource type's buffer widths and study-trigger distances. Zero when the profile names none. */
function searchDistanceFt(rules: InForceRules, resourceTypeKey: string): number {
  return Math.max(
    0,
    ...rules.bufferRules.filter((b) => b.resourceType === resourceTypeKey).map((b) => b.widthFt),
    ...rules.studyTriggers.filter((t) => t.resourceType === resourceTypeKey).map((t) => t.withinFt),
  );
}

export async function computeScreening(
  rules: InForceRules,
  mappings: JurisdictionDatasetMapping[],
  studyAreaGeom: Geometry,
  srid: number,
): Promise<ScreeningRow[]> {
  const rows: ScreeningRow[] = [];
  const studyArea = studyAreaSql(studyAreaGeom);

  for (const resourceType of rules.resourceTypes) {
    const searchedWithinFt = searchDistanceFt(rules, resourceType.key);
    for (const mapping of mappings.filter((m) => m.resourceTypeKey === resourceType.key).filter(isReady)) {
      // R7: a mapped dataset whose coverage excludes the study area is F7's gap, not a row of zeros.
      // The gap is already in evidenceBase.gaps, and the register joins the two at display time.
      if (!(await coverageReachesStudyArea(mapping.dataset.coverage, studyAreaGeom))) continue;
      const versionId = mapping.dataset.currentVersionId;

      const [measured] = await db
        .execute<{ intersecting: number; area_sq_ft: number; length_ft: number; nearest_ft: number | null }>(
          sql`
            select
              (count(*) filter (where ST_Intersects(geom, ${studyArea})))::int as intersecting,
              coalesce(sum(ST_Area(ST_Transform(ST_Intersection(geom, ${studyArea}), ${srid}::int)))
                filter (where ST_Intersects(geom, ${studyArea}) and ST_Dimension(geom) = 2), 0)::float8 as area_sq_ft,
              coalesce(sum(ST_Length(ST_Transform(ST_Intersection(geom, ${studyArea}), ${srid}::int)))
                filter (where ST_Intersects(geom, ${studyArea}) and ST_Dimension(geom) = 1), 0)::float8 as length_ft,
              min(ST_Distance(ST_Transform(geom, ${srid}::int), ST_Transform(${studyArea}, ${srid}::int)))
                filter (where ST_DWithin(ST_Transform(geom, ${srid}::int), ST_Transform(${studyArea}, ${srid}::int), ${searchedWithinFt}))::float8 as nearest_ft
            from evidence_feature
            where dataset_version_id = ${versionId}
          `,
        )
        .then((r) => r.rows);
      if (!measured) throw new Error("screening query unexpectedly returned no row");

      rows.push({
        resourceType: resourceType.key,
        datasetVersionId: versionId,
        intersectingFeatureCount: measured.intersecting,
        overlapAreaSqFt: measured.area_sq_ft,
        overlapLengthFt: measured.length_ft,
        searchedWithinFt,
        // R3: null when nothing is mapped within the search distance. It is never 0 or infinity.
        nearestDistanceFt: measured.nearest_ft,
        bufferReaches: await computeBufferReaches(rules, resourceType.key, mapping, studyAreaGeom, srid),
        approximate: resourceType.mapStatus === "approximate", // R8
      });
    }
  }
  return sortScreening(rows);
}

/**
 * R2, R4: features OFF the study area whose buffers reach onto it, per buffer rule. Reuses F9's
 * `evaluateAppliesWhen`, so the range rule lives in one place: a "no" is dropped, and an attribute the
 * evidence lacks is "unknown", never assumed to apply and never assumed not to.
 */
async function computeBufferReaches(
  rules: InForceRules,
  resourceTypeKey: string,
  mapping: ReadyMapping,
  studyAreaGeom: Geometry,
  srid: number,
): Promise<ScreeningRow["bufferReaches"]> {
  const studyArea = studyAreaSql(studyAreaGeom);
  const reaches: ScreeningRow["bufferReaches"] = [];

  for (const buffer of rules.bufferRules.filter((b) => b.resourceType === resourceTypeKey)) {
    const found = await db
      .execute<{ attributes: Record<string, unknown> }>(
        sql`
          select attributes
          from evidence_feature
          where dataset_version_id = ${mapping.dataset.currentVersionId}
            and not ST_Intersects(geom, ${studyArea})
            and ST_DWithin(ST_Transform(geom, ${srid}::int), ST_Transform(${studyArea}, ${srid}::int), ${buffer.widthFt})
        `,
      )
      .then((r) => r.rows);

    let yes = 0;
    let unknown = 0;
    for (const feature of found) {
      const applicability = evaluateAppliesWhen(buffer.appliesWhen, feature.attributes, mapping.attributeMap);
      if (applicability === "yes") yes += 1;
      else if (applicability === "unknown") unknown += 1;
    }
    if (yes > 0) reaches.push({ ruleKey: buffer.key, applicability: "yes", featureCount: yes });
    if (unknown > 0) reaches.push({ ruleKey: buffer.key, applicability: "unknown", featureCount: unknown });
  }
  return reaches;
}

/**
 * R5, R6: each study trigger in force whose distance condition is met by mapped data becomes a flag.
 * A flag can add a study; the absence of a flag is a fact about the mapped data, never a waiver.
 */
export async function computeStudyFlags(
  rules: InForceRules,
  mappings: JurisdictionDatasetMapping[],
  studyAreaGeom: Geometry,
  srid: number,
): Promise<StudyFlag[]> {
  const flags: StudyFlag[] = [];
  const studyArea = studyAreaSql(studyAreaGeom);

  for (const trigger of rules.studyTriggers) {
    const resourceType = rules.resourceTypes.find((r) => r.key === trigger.resourceType);
    // The profile schema already rejects a trigger for an unknown resource type; this states the invariant.
    if (!resourceType) throw new ValidationError(`study trigger ${trigger.key} names an unknown resource type`);

    const evidence: StudyFlag["evidence"] = [];
    let nearest: number | null = null;
    for (const mapping of mappings.filter((m) => m.resourceTypeKey === trigger.resourceType).filter(isReady)) {
      const found = await db
        .execute<{ source_feature_id: string; distance_ft: number }>(
          sql`
            select source_feature_id,
              ST_Distance(ST_Transform(geom, ${srid}::int), ST_Transform(${studyArea}, ${srid}::int))::float8 as distance_ft
            from evidence_feature
            where dataset_version_id = ${mapping.dataset.currentVersionId}
              and ST_DWithin(ST_Transform(geom, ${srid}::int), ST_Transform(${studyArea}, ${srid}::int), ${trigger.withinFt})
            order by source_feature_id
          `,
        )
        .then((r) => r.rows);
      for (const feature of found) {
        evidence.push({ datasetVersionId: mapping.dataset.currentVersionId, sourceFeatureId: feature.source_feature_id });
        nearest = nearest === null ? feature.distance_ft : Math.min(nearest, feature.distance_ft);
      }
    }
    if (evidence.length === 0 || nearest === null) continue; // R6: no flag is a fact about mapped data, never a waiver

    flags.push({
      triggerKey: trigger.key,
      study: trigger.study,
      resourceType: trigger.resourceType,
      nearestDistanceFt: nearest,
      approximate: resourceType.mapStatus === "approximate",
      ruleKeys: [trigger.key],
      evidence,
    });
  }
  return flags;
}
