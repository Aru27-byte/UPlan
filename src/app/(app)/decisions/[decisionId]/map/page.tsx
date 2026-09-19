import { getDecision, getLatestGeometry, saveGeometry } from "@/modules/decisions";
import { getJurisdictionDatasetMappings, getDatasetVersionProvenance } from "@/modules/evidence";
import { getCurrentProfile, getJurisdictionBoundary, ProfileDocumentSchema } from "@/modules/profiles";
import { formatEvidenceProvenance } from "@/modules/provenance";

import { requireActor } from "@/app/_lib/actor";
import { GeometryEditor } from "@/ui/footprint-editor.client";
import { boundsFromFirst } from "@/ui/geo-bounds";
import { MapWorkspace, type EvidenceLayer } from "@/ui/map-workspace.client";

const BASEMAP_URL = "/basemap/basemap.pmtiles";

// TechDesign/map-workspace.md — W4: the map and its text equivalent, built on decisions/evidence/
// provenance. Every layer's provenance is resolved here, server-side, and passed to the client
// component as plain formatted strings — it never imports @/modules itself (provenance.md's
// boundary note; file-structure-and-imports.md).
export default async function MapWorkspacePage({ params }: { params: Promise<{ decisionId: string }> }) {
  const { decisionId } = await params;
  const { actor } = await requireActor();

  const decision = await getDecision(actor, decisionId);
  const [studyArea, footprint, mappings, jurisdictionBoundary, profileVersion] = await Promise.all([
    getLatestGeometry(actor, decisionId, "study_area"),
    getLatestGeometry(actor, decisionId, "footprint"),
    getJurisdictionDatasetMappings(decision.jurisdictionId),
    getJurisdictionBoundary(actor, decision.jurisdictionId),
    getCurrentProfile(actor, decision.jurisdictionId),
  ]);
  const studyAreaGeom = studyArea?.geom.type === "MultiPolygon" ? studyArea.geom : null;
  // Point the camera at whatever's actually drawn — falling back to the jurisdiction's own
  // boundary when a decision has neither yet — instead of MapLibre's [0, 0] default (see
  // geo-bounds.ts: every layer below would still render, just nowhere near the viewport).
  const initialBounds = boundsFromFirst([
    studyArea?.geom ?? null,
    footprint?.geom ?? null,
    jurisdictionBoundary,
  ]);
  if (!initialBounds) throw new Error("jurisdiction boundary unexpectedly produced no bounds");

  // Built in the profile's own resourceTypes order (not mappings' arbitrary DB order) — the same
  // order the Evidence tab's cards use, and stable across reloads, so the color assigned to a
  // layer here (map-styles.ts's fixed categorical order) always means the same layer every time.
  const profile = profileVersion ? ProfileDocumentSchema.parse(profileVersion.document) : null;
  const layers: EvidenceLayer[] = [];
  for (const resourceType of profile?.resourceTypes ?? []) {
    const mapping = mappings.find((m) => m.resourceTypeKey === resourceType.key);
    if (!mapping?.dataset.currentVersionId) continue; // a gap (evidence/page.tsx) — nothing to show on the map either
    const provenance = await getDatasetVersionProvenance(mapping.dataset.currentVersionId);
    layers.push({
      datasetVersionId: mapping.dataset.currentVersionId,
      label: mapping.dataset.title,
      mapStatus: resourceType.mapStatus,
      provenance: formatEvidenceProvenance(provenance),
    });
  }

  async function saveStudyAreaAction(
    geojson: GeoJSON.MultiPolygon,
    sourceNote: string,
    expectedRevision: number,
  ) {
    "use server";
    const { actor: savingActor } = await requireActor();
    await saveGeometry(savingActor, decisionId, "study_area", geojson, sourceNote, expectedRevision);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card-sticker bg-white p-4">
        <MapWorkspace
          basemapUrl={BASEMAP_URL}
          layers={layers}
          studyAreaGeoJson={studyArea?.geom ?? null}
          footprintGeoJson={footprint?.geom ?? null}
          initialBounds={initialBounds}
        />
      </div>

      <details className="card-sticker bg-white p-4">
        <summary className="cursor-pointer font-semibold">
          {studyArea
            ? `Redraw the study area (current revision ${studyArea.revision})`
            : "Draw the study area"}
        </summary>
        <div className="mt-4">
          <GeometryEditor
            kind="study_area"
            basemapUrl={BASEMAP_URL}
            referenceGeoJson={null}
            referenceLabel={null}
            initialGeoJson={studyAreaGeom}
            currentRevision={studyArea?.revision ?? 0}
            onSave={saveStudyAreaAction}
            initialBounds={initialBounds}
          />
        </div>
      </details>
    </div>
  );
}
