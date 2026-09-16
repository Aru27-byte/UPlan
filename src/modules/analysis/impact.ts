import { sql } from "drizzle-orm";

import type { JurisdictionDatasetMapping } from "@/modules/evidence";
import { db } from "@/platform/db";
import type { BufferRule, ResourceType } from "@/modules/profiles";

import type { Impact } from "./results";

// TechDesign/impact-analysis.md — the pilot's edge. R8: every measurement is PostGIS's own
// ST_Area/ST_Length after ST_Transform to the jurisdiction's analysis_srid — never JavaScript math.
//
// Every `srid` value below is cast `::int` explicitly. ST_Transform has both a `(geometry, int)`
// and a `(geometry, text)` overload (the latter takes a raw proj4/WKT string, not an SRID) — an
// untyped bound parameter can resolve to the text overload, which then fails with "could not parse
// proj string" on the SRID number itself. Only caught by running this against a real Postgres.

type Applicability = "yes" | "no" | "unknown";

/** R9: a buffer applies only when its condition is met; "unknown" (attribute missing) triggers R3's range. */
function evaluateAppliesWhen(
  appliesWhen: BufferRule["appliesWhen"],
  attributes: Record<string, unknown>,
  attributeMap: Record<string, string>,
): Applicability {
  if (!appliesWhen) return "yes";
  const sourceAttribute = attributeMap[appliesWhen.attribute];
  if (!sourceAttribute || !(sourceAttribute in attributes)) return "unknown";
  return String(attributes[sourceAttribute]) === appliesWhen.equals ? "yes" : "no";
}

export async function computeImpacts(
  resourceTypes: ResourceType[],
  bufferRules: BufferRule[],
  mappings: JurisdictionDatasetMapping[],
  footprintGeom: GeoJSON.Geometry,
  srid: number,
): Promise<Impact[]> {
  const footprintJson = JSON.stringify(footprintGeom);
  const impacts: Impact[] = [];

  for (const resourceType of resourceTypes) {
    for (const m of mappings.filter((x) => x.resourceTypeKey === resourceType.key)) {
      if (!m.dataset.currentVersionId) continue;
      const rows = await db
        .execute<{
          source_feature_id: string;
          geom_type: string;
          attributes: Record<string, unknown>;
          area: number;
          length: number;
        }>(
          sql`
            select source_feature_id, ST_GeometryType(geom) as geom_type, attributes,
              ST_Area(ST_Transform(ST_Intersection(geom, ST_SetSRID(ST_GeomFromGeoJSON(${footprintJson}), 4326)), ${srid}::int)) as area,
              ST_Length(ST_Transform(ST_Intersection(geom, ST_SetSRID(ST_GeomFromGeoJSON(${footprintJson}), 4326)), ${srid}::int)) as length
            from evidence_feature
            where dataset_version_id = ${m.dataset.currentVersionId}
              and ST_Intersects(geom, ST_SetSRID(ST_GeomFromGeoJSON(${footprintJson}), 4326))
          `,
        )
        .then((r) => r.rows);

      for (const r of rows) {
        const isLine = r.geom_type.includes("LineString");
        const measure = isLine
          ? ("feature-length-in-footprint" as const)
          : ("feature-area-in-footprint" as const);
        const value = isLine ? r.length : r.area;
        impacts.push({
          impactKey: `${resourceType.key}:${m.dataset.key}:${r.source_feature_id}:${measure}`,
          resourceType: resourceType.key,
          measure,
          unit: isLine ? "us-survey-ft" : "us-survey-sq-ft",
          min: value,
          max: value,
          dependsOn: null,
          approximate: resourceType.mapStatus === "approximate", // R4
          ruleKeys: [],
          evidence: [{ datasetVersionId: m.dataset.currentVersionId, sourceFeatureId: r.source_feature_id }],
        });
      }
    }
  }

  impacts.push(...(await computeBufferImpacts(resourceTypes, bufferRules, mappings, footprintGeom, srid)));
  return impacts;
}

async function computeBufferImpacts(
  resourceTypes: ResourceType[],
  bufferRules: BufferRule[],
  mappings: JurisdictionDatasetMapping[],
  footprintGeom: GeoJSON.Geometry,
  srid: number,
): Promise<Impact[]> {
  const footprintJson = JSON.stringify(footprintGeom);
  const impacts: Impact[] = [];

  for (const buffer of bufferRules) {
    const resourceType = resourceTypes.find((r) => r.key === buffer.resourceType);
    if (!resourceType) continue;

    for (const m of mappings.filter((x) => x.resourceTypeKey === buffer.resourceType)) {
      if (!m.dataset.currentVersionId) continue;
      const rows = await db
        .execute<{ source_feature_id: string; attributes: Record<string, unknown>; buffered_area: number }>(
          sql`
            select source_feature_id, attributes,
              ST_Area(ST_Transform(ST_Intersection(
                ST_Buffer(ST_Transform(geom, ${srid}::int), ${buffer.widthFt}),
                ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(${footprintJson}), 4326), ${srid}::int)
              ), ${srid}::int)) as buffered_area
            from evidence_feature
            where dataset_version_id = ${m.dataset.currentVersionId}
              and ST_DWithin(ST_Transform(geom, ${srid}::int), ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(${footprintJson}), 4326), ${srid}::int), ${buffer.widthFt})
          `,
        )
        .then((r) => r.rows);

      for (const r of rows) {
        if (r.buffered_area === 0) continue; // an honest zero — nothing to report

        const appliesWhen = buffer.appliesWhen;
        const applicability = evaluateAppliesWhen(appliesWhen, r.attributes, m.attributeMap);
        if (applicability === "no") continue;

        let min: number;
        let max: number;
        let dependsOn: string | null;
        if (applicability === "unknown") {
          // evaluateAppliesWhen only returns "unknown" when appliesWhen is set (it returns "yes"
          // immediately otherwise) — checked explicitly here rather than asserted, per the no
          // non-null-assertion rule.
          if (!appliesWhen)
            throw new Error("invariant violated: 'unknown' applicability implies appliesWhen is set");
          min = 0; // R3: the rule might not apply — range brackets both possibilities
          max = r.buffered_area;
          dependsOn = appliesWhen.attribute;
        } else {
          min = r.buffered_area;
          max = r.buffered_area;
          dependsOn = null;
        }

        impacts.push({
          impactKey: `${resourceType.key}:${m.dataset.key}:${r.source_feature_id}:buffer-area-in-footprint:${buffer.key}`,
          resourceType: resourceType.key,
          measure: "buffer-area-in-footprint",
          unit: "us-survey-sq-ft",
          min,
          max,
          dependsOn,
          approximate: resourceType.mapStatus === "approximate",
          ruleKeys: [buffer.key],
          evidence: [{ datasetVersionId: m.dataset.currentVersionId, sourceFeatureId: r.source_feature_id }],
        });
      }
    }
  }
  return impacts;
}

export { evaluateAppliesWhen };
