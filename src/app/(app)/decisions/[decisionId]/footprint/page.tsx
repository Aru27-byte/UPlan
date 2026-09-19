import Link from "next/link";
import type { MultiPolygon } from "geojson";

import { getDecision, getGeometryAreaAcres, getLatestGeometry, saveGeometry } from "@/modules/decisions";
import { getJurisdiction } from "@/modules/profiles";

import { requireActor } from "@/app/_lib/actor";
import { GeometryEditor } from "@/ui/footprint-editor.client";
import { boundsFromFirst } from "@/ui/geo-bounds";
import { StatTile } from "@/ui/stat-tile";

// Split out only so `studyAreaGeom` can be typed as a definite MultiPolygon (never null) here —
// the caller only reaches this branch once it's confirmed one exists — instead of a non-null
// assertion at the boundsFromFirst call below (conventions.md: no non-null assertions).
function FootprintEditorSection({
  studyAreaGeom,
  footprintGeom,
  footprintRevision,
  onSave,
}: {
  studyAreaGeom: MultiPolygon;
  footprintGeom: MultiPolygon | null;
  footprintRevision: number;
  onSave: (geojson: MultiPolygon, sourceNote: string, expectedRevision: number) => Promise<void>;
}) {
  const initialBounds = boundsFromFirst([footprintGeom, studyAreaGeom]);
  if (!initialBounds) throw new Error("a real study area unexpectedly produced no bounds");

  return (
    <div className="card-sticker bg-white p-4">
      <GeometryEditor
        kind="footprint"
        basemapUrl="/basemap/basemap.pmtiles"
        referenceGeoJson={studyAreaGeom}
        referenceLabel="study area"
        initialGeoJson={footprintGeom}
        currentRevision={footprintRevision}
        onSave={onSave}
        initialBounds={initialBounds}
      />
    </div>
  );
}

// UIDesign/Footprint.png + TechDesign/proposal-footprint.md (F8) — the real tracing workflow: an
// editable Terra Draw footprint over the (read-only) study area, saved through F5's saveGeometry.
// Simplified from the mockup exactly as before: `decision_geometry` stores one footprint polygon
// per revision with no cleared/graded/impervious/access-corridor sub-typing, so the summary above
// the editor shows the one real, PostGIS-computed total instead of fabricating a breakdown.
export default async function FootprintPage({ params }: { params: Promise<{ decisionId: string }> }) {
  const { decisionId } = await params;
  const { actor } = await requireActor();

  const decision = await getDecision(actor, decisionId);
  const [jurisdiction, studyArea, footprint] = await Promise.all([
    getJurisdiction(actor, decision.jurisdictionId),
    getLatestGeometry(actor, decisionId, "study_area"),
    getLatestGeometry(actor, decisionId, "footprint"),
  ]);
  const areaAcres = footprint
    ? await getGeometryAreaAcres(actor, decisionId, "footprint", jurisdiction.analysisSrid)
    : null;

  const studyAreaGeom = studyArea?.geom.type === "MultiPolygon" ? studyArea.geom : null;
  const footprintGeom = footprint?.geom.type === "MultiPolygon" ? footprint.geom : null;

  async function saveFootprintAction(
    geojson: GeoJSON.MultiPolygon,
    sourceNote: string,
    expectedRevision: number,
  ) {
    "use server";
    const { actor: savingActor } = await requireActor();
    await saveGeometry(savingActor, decisionId, "footprint", geojson, sourceNote, expectedRevision);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-ink/70 text-sm">
        Traced by the planner from the applicant&apos;s site plan. The footprint is the proposal under
        evaluation — not evidence.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <StatTile
          label="Footprint area"
          value={areaAcres !== null ? `${areaAcres.toFixed(1)} ac` : "Not yet traced"}
          color="yellow"
        />
        <StatTile label="Revision" value={footprint ? footprint.revision : "—"} color="tan" />
      </div>

      {!studyAreaGeom ? (
        <p className="card-sticker bg-white p-4 text-sm">
          Draw the study area first, on the{" "}
          <Link href={`/decisions/${decisionId}/map`} className="underline">
            Map
          </Link>{" "}
          tab — the footprint is traced relative to it.
        </p>
      ) : (
        <FootprintEditorSection
          studyAreaGeom={studyAreaGeom}
          footprintGeom={footprintGeom}
          footprintRevision={footprint?.revision ?? 0}
          onSave={saveFootprintAction}
        />
      )}
    </div>
  );
}
