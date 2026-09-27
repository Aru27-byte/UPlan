import { z } from "zod";

import { phaseModel } from "@/app/_lib/phase-model";
import { loadProject } from "@/app/_lib/project";
import { getLatestGeometry } from "@/modules/decisions";
import { getDatasetVersionProvenance, getJurisdictionDatasetMappings } from "@/modules/evidence";
import { ProfileDocumentSchema, getCurrentProfile, getJurisdictionBoundary } from "@/modules/profiles";
import { formatEvidenceProvenance } from "@/modules/provenance";
import { boundsFromFirst } from "@/ui/geo-bounds";
import { MapWorkspace, type EvidenceLayer } from "@/ui/map-workspace.client";
import { Panel } from "@/ui/panel";
import { PhasePage } from "@/ui/phase/phase-page";

import { recordReviewAction } from "../actions";
import { BASEMAP_URL, BoundaryPanel } from "../_components/boundary-panel";

// Phase 1 of the research (TechDesign/research-phases.md): the study area, the map, and the drafted
// description of the boundary. Every layer's provenance is resolved here and passed to the client map as
// plain strings, because the map imports no module code (file-structure-and-imports.md).
export default async function SitePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ layer?: string | string[] }>;
}) {
  const { projectId } = await params;
  const { layer } = await searchParams;
  const { actor, workflow: w } = await loadProject(projectId);
  const d = w.decision;

  const [studyArea, footprint, mappings, cityBoundary, profileVersion] = await Promise.all([
    getLatestGeometry(actor, projectId, "study_area"),
    getLatestGeometry(actor, projectId, "footprint"),
    getJurisdictionDatasetMappings(d.jurisdictionId),
    getJurisdictionBoundary(d.jurisdictionId),
    getCurrentProfile(d.jurisdictionId),
  ]);
  const studyAreaGeom = studyArea?.geom.type === "MultiPolygon" ? studyArea.geom : null;
  const footprintGeom = footprint?.geom.type === "MultiPolygon" ? footprint.geom : null;

  // Point the camera at what is drawn, or at the city when nothing is (MapLibre's default is [0, 0]).
  const bounds = boundsFromFirst([studyArea?.geom ?? null, footprint?.geom ?? null, cityBoundary]);
  if (!bounds) throw new Error("the city's boundary produced no bounds");

  // In the profile's own resource-type order, so a layer's color means the same on every load.
  const profile = profileVersion ? ProfileDocumentSchema.parse(profileVersion.document) : null;
  const layers: EvidenceLayer[] = [];
  const notOnMap: string[] = [];
  for (const resourceType of profile?.resourceTypes ?? []) {
    const mapping = mappings.find((m) => m.resourceTypeKey === resourceType.key);
    if (!mapping?.dataset.currentVersionId) {
      notOnMap.push(resourceType.label);
      continue;
    }
    layers.push({
      datasetVersionId: mapping.dataset.currentVersionId,
      label: mapping.dataset.title,
      mapStatus: resourceType.mapStatus,
      provenance: formatEvidenceProvenance(await getDatasetVersionProvenance(mapping.dataset.currentVersionId)),
    });
  }
  const focus = z.uuid().safeParse(Array.isArray(layer) ? layer[0] : layer);
  const focusLayerId = focus.success && layers.some((l) => l.datasetVersionId === focus.data) ? focus.data : null;

  return (
    <PhasePage
      model={phaseModel(w, projectId, "site")}
      reviewAction={recordReviewAction.bind(null, projectId)}
      editor={
        <BoundaryPanel
          projectId={projectId}
          kind="study_area"
          revision={studyArea?.revision ?? 0}
          geometry={studyAreaGeom}
          referenceGeometry={null}
          bounds={bounds}
          readOnly={w.decisionStatus !== "in_progress"}
        />
      }
    >
      <Panel
        id="map-workspace"
        title="Map workspace"
        description="The study area, the footprint, and every mapped evidence layer for this city. Every layer is also listed below the map as text."
      >
        <MapWorkspace
          basemapUrl={BASEMAP_URL}
          layers={layers}
          studyAreaGeoJson={studyAreaGeom}
          footprintGeoJson={footprintGeom}
          initialBounds={bounds}
          focusLayerId={focusLayerId}
        />
        {notOnMap.length > 0 ? (
          <p className="mt-4 border-t border-line pt-3 text-sm text-text">
            <span className="font-semibold">Not on the map:</span> {notOnMap.join(", ")}. No dataset is mapped for{" "}
            {notOnMap.length === 1 ? "it" : "them"}, so nothing can be said about {notOnMap.length === 1 ? "it" : "them"}{" "}
            from the map.
          </p>
        ) : null}
      </Panel>
    </PhasePage>
  );
}
