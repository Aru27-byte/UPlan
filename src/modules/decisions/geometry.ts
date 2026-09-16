import { sql } from "drizzle-orm";
import type { Geometry } from "geojson";

import { requireMembership, requirePlanner, type Actor } from "@/modules/accounts";
import { db } from "@/platform/db";
import { ConflictError, ValidationError, isUniqueViolation } from "@/platform/errors";
import { enqueueAnalysisRun } from "@/platform/jobs";

import { getDecision } from "./decisions";
import { decisionGeometry } from "./tables";

export type GeometryKind = "study_area" | "footprint";

export type DecisionGeometry = {
  decisionId: string;
  kind: GeometryKind;
  revision: number;
  geom: Geometry;
  sourceNote: string;
  createdBy: string;
  createdAt: Date;
};

// Every column except `geom`, mirroring jurisdiction/dataset's own pattern (see the note in
// platform/geometry-column.ts): a plain `.select()`/`.returning()` of a geometry column throws,
// because PostGIS returns its own wire format, not GeoJSON. `saveGeometry`'s caller already has
// the GeoJSON it just sent, so its `.returning()` never needs `geom` back.
const decisionGeometryColumnsWithoutGeom = {
  decisionId: decisionGeometry.decisionId,
  kind: decisionGeometry.kind,
  revision: decisionGeometry.revision,
  sourceNote: decisionGeometry.sourceNote,
  createdBy: decisionGeometry.createdBy,
  createdAt: decisionGeometry.createdAt,
};

// TechDesign/decisions.md — R2: no parcel-line constraint, ever. R5/R6: every save is a new,
// numbered revision; the primary key (decision_id, kind, revision) is the actual race guard, not a
// "read the max and increment" check in application code. R7: an invalid drawing is rejected with
// the specific reason and never repaired — repair only ever happens to ingested source data
// (see modules/evidence/gdal.ts), never to what a planner drew.
//
// system-architecture.md's "Analysis run" flow: a run is triggered by, among other things, "a
// saved study area, footprint, or filing date." The enqueue happens in the same transaction as the
// insert (concurrency rule: "Enqueue jobs... inside the transaction that needs them") — there is
// never a saved geometry revision without a queued run behind it.
export async function saveGeometry(
  actor: Actor,
  decisionId: string,
  kind: GeometryKind,
  geojson: Geometry,
  sourceNote: string,
  expectedRevision: number,
) {
  const d = await getDecision(actor, decisionId);
  requirePlanner(actor, d.jurisdictionId);

  if (geojson.type !== "MultiPolygon") {
    throw new ValidationError(`${kind} must be a MultiPolygon, got ${geojson.type}`);
  }

  const [validity] = await db
    .execute<{ valid: boolean; reason: string }>(
      sql`
        select
          ST_IsValid(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geojson)}), 4326)) as valid,
          ST_IsValidReason(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geojson)}), 4326)) as reason
      `,
    )
    .then((r) => r.rows);
  if (!validity) throw new Error("ST_IsValid check unexpectedly returned no row");
  if (!validity.valid) throw new ValidationError(`drawn geometry is invalid: ${validity.reason}`); // R7 — never repaired

  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(decisionGeometry)
        .values({
          decisionId,
          kind,
          revision: expectedRevision,
          geom: geojson,
          sourceNote,
          createdBy: actor.userId,
        })
        .returning(decisionGeometryColumnsWithoutGeom);
      await enqueueAnalysisRun(decisionId, { purpose: "current" }, tx);
      return row;
    });
  } catch (err) {
    if (isUniqueViolation(err))
      throw new ConflictError(`revision ${expectedRevision} already exists for this ${kind}`); // R6
    throw err;
  }
}

export async function getLatestGeometry(
  actor: Actor,
  decisionId: string,
  kind: GeometryKind,
): Promise<DecisionGeometry | null> {
  const d = await getDecision(actor, decisionId);
  requireMembership(actor, d.jurisdictionId);
  return getLatestGeometryInternal(decisionId, kind);
}

/** For internal (system-authority) callers such as run_analysis. */
export async function getLatestGeometryInternal(
  decisionId: string,
  kind: GeometryKind,
): Promise<DecisionGeometry | null> {
  const [row] = await db
    .execute<{
      decision_id: string;
      kind: GeometryKind;
      revision: number;
      geom_geojson: string;
      source_note: string;
      created_by: string;
      created_at: Date;
    }>(
      sql`
        select decision_id, kind, revision, ST_AsGeoJSON(geom) as geom_geojson, source_note, created_by, created_at
        from decision_geometry
        where decision_id = ${decisionId} and kind = ${kind}
        order by revision desc
        limit 1
      `,
    )
    .then((r) => r.rows);
  if (!row) return null;
  return {
    decisionId: row.decision_id,
    kind: row.kind,
    revision: row.revision,
    geom: JSON.parse(row.geom_geojson) as Geometry,
    sourceNote: row.source_note,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

/**
 * For the dashboard and Footprint tab (UIDesign/Dashboard.png, Footprint.png): the latest
 * revision's area in acres. Computed entirely in PostGIS (`.claude/rules/do-not.md`: "Don't
 * compute an area, length, or buffer in JavaScript") in the jurisdiction's own analysis projection,
 * exactly like the impact engine. Returns null when no revision of that kind exists yet.
 */
export async function getGeometryAreaAcres(
  actor: Actor,
  decisionId: string,
  kind: GeometryKind,
  analysisSrid: number,
): Promise<number | null> {
  const d = await getDecision(actor, decisionId);
  requireMembership(actor, d.jurisdictionId);
  const [row] = await db
    .execute<{ acres: number | null }>(
      sql`
        -- ::int: ST_Transform also has a (geometry, text) overload (a raw proj4/WKT string, not
        -- an SRID) that an untyped bound parameter can resolve to instead — see impact.ts's note.
        select ST_Area(ST_Transform(geom, ${analysisSrid}::int)) / 43560 as acres
        from decision_geometry
        where decision_id = ${decisionId} and kind = ${kind}
        order by revision desc
        limit 1
      `,
    )
    .then((r) => r.rows);
  return row?.acres ?? null;
}
