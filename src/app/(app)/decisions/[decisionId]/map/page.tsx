import { getDecision, getLatestGeometry, saveGeometry } from "@/modules/decisions";
import { getJurisdictionDatasetMappings, getDatasetVersionProvenance } from "@/modules/evidence";
import { formatEvidenceProvenance } from "@/modules/provenance";

import { requireActor } from "@/app/_lib/actor";
import { EvidenceTextView } from "@/ui/evidence-text-view";
import { GeometryEditor } from "@/ui/footprint-editor.client";
import { MapWorkspace, type EvidenceLayer } from "@/ui/map-workspace.client";

const BASEMAP_URL = "/basemap/{z}/{x}/{y}.png";

// TechDesign/map-workspace.md — W4: the map and its text equivalent, built on decisions/evidence/
// provenance. Every layer's provenance is resolved here, server-side, and passed to the client
// component as plain formatted strings — it never imports @/modules itself (provenance.md's
// boundary note; file-structure-and-imports.md).
export default async function MapWorkspacePage({ params }: { params: Promise<{ decisionId: string }> }) {
  const { decisionId } = await params;
  const { actor } = await requireActor();

  const decision = await getDecision(actor, decisionId);
  const [studyArea, footprint, mappings] = await Promise.all([
    getLatestGeometry(actor, decisionId, "study_area"),
    getLatestGeometry(actor, decisionId, "footprint"),
    getJurisdictionDatasetMappings(decision.jurisdictionId),
  ]);
  const studyAreaGeom = studyArea?.geom.type === "MultiPolygon" ? studyArea.geom : null;

  const layers: EvidenceLayer[] = [];
  for (const m of mappings) {
    if (!m.dataset.currentVersionId) continue;
    const provenance = await getDatasetVersionProvenance(m.dataset.currentVersionId);
    layers.push({
      datasetVersionId: m.dataset.currentVersionId,
      label: m.dataset.title,
      mapStatus: "approximate", // resolved from the current profile's resourceTypes[].mapStatus in the full implementation
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
        />
        <div className="mt-4">
          <EvidenceTextView layers={layers} />
        </div>
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
          />
        </div>
      </details>
    </div>
  );
}
