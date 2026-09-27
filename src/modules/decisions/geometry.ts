import { sql } from "drizzle-orm";
import type { Geometry, MultiPolygon } from "geojson";
import { z } from "zod";

import type { Actor } from "@/modules/accounts";
import { db, type DbOrTx } from "@/platform/db";
import { ConflictError, ValidationError, isUniqueViolation } from "@/platform/errors";
import { enqueueAnalysisRun } from "@/platform/jobs";

import { getDecision, lockEditableDecision } from "./decisions";
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

// Zod at the boundary (conventions.md). A ring must be closed and hold at least four positions;
// every position is exactly [longitude, latitude]. Anything else is rejected with a message, never
// reshaped: repairing what a planner drew would substitute UPlan's guess for their intent (R7).
const PositionSchema = z.tuple([z.number().finite(), z.number().finite()], {
  error: "Each coordinate must be a [longitude, latitude] pair.",
});
const RingSchema = z
  .array(PositionSchema)
  .min(4, "A polygon ring needs at least four points.")
  .refine(
    (ring) => {
      const first = ring[0];
      const last = ring[ring.length - 1];
      return first !== undefined && last !== undefined && first[0] === last[0] && first[1] === last[1];
    },
    { message: "A polygon ring must end where it starts." },
  );
export const MultiPolygonSchema = z.object({
  type: z.literal("MultiPolygon"),
  coordinates: z.array(z.array(RingSchema).min(1)).min(1, "The boundary has no polygon."),
});

// Every column except `geom`: a plain `.select()`/`.returning()` of a geometry column throws,
// because PostGIS returns its own wire format, not GeoJSON (platform/geometry-column.ts).
const decisionGeometryColumnsWithoutGeom = {
  decisionId: decisionGeometry.decisionId,
  kind: decisionGeometry.kind,
  revision: decisionGeometry.revision,
  sourceNote: decisionGeometry.sourceNote,
  createdBy: decisionGeometry.createdBy,
  createdAt: decisionGeometry.createdAt,
};

/** R7: a drawn geometry that isn't valid is rejected outright, with PostGIS's reason, and never repaired. */
export async function assertValidGeometry(geom: MultiPolygon): Promise<void> {
  const [validity] = await db
    .execute<{ valid: boolean; reason: string }>(
      sql`
        select
          ST_IsValid(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geom)}), 4326)) as valid,
          ST_IsValidReason(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geom)}), 4326)) as reason
      `,
    )
    .then((r) => r.rows);
  if (!validity) throw new Error("ST_IsValid check unexpectedly returned no row");
  if (!validity.valid) throw new ValidationError(`The boundary isn't valid: ${validity.reason}`); // never repaired
}

/**
 * The insert of one numbered revision, inside the caller's transaction. The primary key
 * (decision_id, kind, revision) is the race guard: two saves of one revision, the second fails (R5,
 * R6). Shared by saveGeometry and createSampleProject, so neither duplicates the other.
 */
export async function insertGeometryRevision(
  tx: DbOrTx,
  input: { decisionId: string; kind: GeometryKind; revision: number; geom: MultiPolygon; sourceNote: string; createdBy: string },
) {
  const [row] = await tx.insert(decisionGeometry).values(input).returning(decisionGeometryColumnsWithoutGeom);
  if (!row) throw new Error("insert into decision_geometry unexpectedly returned no row");
  return row;
}

// TechDesign/decisions.md — R2: no parcel-line constraint, ever. R5/R6: every save is a new,
// numbered revision. R7: an invalid drawing is rejected with the specific reason and never repaired
// (repair only ever happens to ingested source data, see modules/evidence/gdal.ts). R13: only an
// in-progress decision can be changed.
//
// system-architecture.md's "Analysis run" flow: a run is triggered by, among other things, "a saved
// study area, footprint, or filing date." The enqueue happens in the same transaction as the insert:
// there is never a saved geometry revision without a queued run behind it.
export async function saveGeometry(
  actor: Actor,
  decisionId: string,
  kind: GeometryKind,
  geojson: unknown,
  sourceNote: string,
  expectedRevision: number,
) {
  const parsed = MultiPolygonSchema.safeParse(geojson);
  if (!parsed.success) {
    throw new ValidationError(`The boundary isn't a valid polygon: ${parsed.error.issues[0]?.message ?? "unrecognized shape"}`);
  }
  const note = sourceNote.trim();
  if (note.length === 0) throw new ValidationError("Say where this boundary came from.");
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
    throw new ValidationError("A boundary revision is a whole number, starting at 1.");
  }
  // Before the transaction and its lock, so an invalid drawing never holds the project's lock.
  await assertValidGeometry(parsed.data);

  try {
    return await db.transaction(async (tx) => {
      await lockEditableDecision(tx, actor, decisionId); // R13
      const row = await insertGeometryRevision(tx, {
        decisionId,
        kind,
        revision: expectedRevision,
        geom: parsed.data,
        sourceNote: note,
        createdBy: actor.userId,
      });
      await enqueueAnalysisRun(decisionId, { purpose: "current" }, tx);
      return row;
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ConflictError(`Revision ${expectedRevision} of the ${kind.replace("_", " ")} already exists. Reload the page to see the latest.`); // R6
    }
    throw err;
  }
}

async function readLatest(
  tx: DbOrTx,
  decisionId: string,
  kind: GeometryKind,
  revision?: number,
): Promise<DecisionGeometry | null> {
  const [row] = await tx
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
          ${revision === undefined ? sql`` : sql`and revision = ${revision}`}
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

export async function getLatestGeometry(
  actor: Actor,
  decisionId: string,
  kind: GeometryKind,
): Promise<DecisionGeometry | null> {
  await getDecision(actor, decisionId); // ownership (accounts-roles.md R3)
  return readLatest(db, decisionId, kind);
}

/** For internal (system-authority) callers such as run_analysis. */
export async function getLatestGeometryInternal(
  decisionId: string,
  kind: GeometryKind,
  tx: DbOrTx = db,
): Promise<DecisionGeometry | null> {
  return readLatest(tx, decisionId, kind);
}

/** For renderers: a pinned revision, never "the latest" (F22 R11). Null when that revision doesn't exist. */
export async function getGeometryRevisionInternal(
  decisionId: string,
  kind: GeometryKind,
  revision: number,
): Promise<DecisionGeometry | null> {
  return readLatest(db, decisionId, kind, revision);
}

export type GeometrySvg = {
  path: string; // ST_AsSVG's own path, in planar coordinates of the analysis projection (y already negated, as SVG expects)
  xmin: number;
  ymin: number; // bounds in the same planar coordinates as the path, before the y negation
  xmax: number;
  ymax: number;
};

/**
 * For the document's maps (TechDesign/locked-report.md): a pinned revision drawn as an SVG path by
 * PostGIS, from the same geometry the numbers came from, never a screenshot of the live map (D12). The
 * jurisdiction's own planar projection keeps shapes close to true (Web Mercator would stretch them).
 * The caller builds the viewBox from the bounds. Null when that revision doesn't exist.
 */
export async function getGeometrySvgInternal(
  decisionId: string,
  kind: GeometryKind,
  revision: number,
  analysisSrid: number,
): Promise<GeometrySvg | null> {
  const [row] = await db
    .execute<{ path: string; xmin: number; ymin: number; xmax: number; ymax: number }>(
      sql`
        select ST_AsSVG(t, 0, 1) as path,
          ST_XMin(t)::float8 as xmin, ST_YMin(t)::float8 as ymin, ST_XMax(t)::float8 as xmax, ST_YMax(t)::float8 as ymax
        from (
          select ST_Transform(geom, ${analysisSrid}::int) as t
          from decision_geometry
          where decision_id = ${decisionId} and kind = ${kind} and revision = ${revision}
        ) s
      `,
    )
    .then((r) => r.rows);
  return row ?? null;
}

export type GeometrySummary = {
  revision: number;
  areaAcres: number; // unrounded, computed in PostGIS in the jurisdiction's analysis projection
  sourceNote: string;
  createdAt: Date;
};

/**
 * The latest revision's facts for the phase outputs and the dashboard: one query, so the revision and
 * its area can't come from two different reads. The area is computed entirely in PostGIS in the
 * jurisdiction's own analysis projection, exactly like the impact engine (`do-not.md`: "Don't compute an
 * area, length, or buffer in JavaScript"). Null when no revision of that kind exists yet. System
 * authority: the caller has already reached the decision through getDecision or lockEditableDecision.
 */
export async function getGeometrySummaryInternal(
  decisionId: string,
  kind: GeometryKind,
  analysisSrid: number,
  tx: DbOrTx = db,
  revision?: number, // a pinned revision, for the document; the latest when omitted
): Promise<GeometrySummary | null> {
  const [row] = await tx
    .execute<{ revision: number; acres: number; source_note: string; created_at: Date }>(
      sql`
        -- ::int: ST_Transform also has a (geometry, text) overload (a raw proj4/WKT string, not an SRID)
        -- that an untyped bound parameter can resolve to instead — see impact.ts's note.
        select revision, ST_Area(ST_Transform(geom, ${analysisSrid}::int)) / 43560 as acres, source_note, created_at
        from decision_geometry
        where decision_id = ${decisionId} and kind = ${kind}
          ${revision === undefined ? sql`` : sql`and revision = ${revision}`}
        order by revision desc
        limit 1
      `,
    )
    .then((r) => r.rows);
  return row ? { revision: row.revision, areaAcres: row.acres, sourceNote: row.source_note, createdAt: row.created_at } : null;
}
