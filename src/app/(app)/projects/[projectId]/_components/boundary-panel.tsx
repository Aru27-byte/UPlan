import type { MultiPolygon } from "geojson";

import type { GeometryKind } from "@/modules/decisions";
import { ActionForm } from "@/ui/action-form.client";
import { inputClassName } from "@/ui/action-styles";
import { GeometryEditor } from "@/ui/footprint-editor.client";
import type { LngLatBounds } from "@/ui/geo-bounds";
import { Panel } from "@/ui/panel";
import { SubmitButton } from "@/ui/submit-button.client";

import { loadSampleBoundaryAction, saveDrawnBoundaryAction, uploadBoundaryAction } from "../actions";

export const BASEMAP_URL = "/basemap/basemap.pmtiles";

const COPY: Record<GeometryKind, { title: string; anchor: string; lead: string; noun: string }> = {
  study_area: {
    title: "Study area",
    anchor: "study-area",
    lead: "The boundary of the district, corridor, or habitat area assessed as a whole. Draw it, upload it, or load the sample. Each save is a new numbered revision, and UPlan drafts every phase from it again.",
    noun: "study area",
  },
  footprint: {
    title: "Footprint",
    anchor: "footprint",
    lead: "What the proposal would clear, grade, or build, traced from the applicant's site plan. It is the proposal under evaluation, not evidence. Each save is a new numbered revision.",
    noun: "footprint",
  },
};

// One panel for both boundaries (research-phases.md R9 "iterating on an output means changing an input").
// A boundary can be drawn on the map, uploaded as GeoJSON, or loaded from the sample (F23); all three go
// through the module's saveGeometry, which validates in PostGIS and rejects an invalid shape rather than
// repairing it. The panel is read-only unless the research is open.
export function BoundaryPanel({
  projectId,
  kind,
  revision,
  geometry,
  referenceGeometry,
  bounds,
  readOnly,
}: {
  projectId: string;
  kind: GeometryKind;
  revision: number; // 0 when nothing is saved yet
  geometry: MultiPolygon | null;
  referenceGeometry: MultiPolygon | null;
  bounds: LngLatBounds;
  readOnly: boolean;
}) {
  const copy = COPY[kind];
  const next = String(revision + 1);

  return (
    <Panel id={copy.anchor} title={copy.title} description={copy.lead}>
      {readOnly ? (
        <p className="text-sm text-muted">
          {revision === 0
            ? `No ${copy.noun} was recorded.`
            : `The ${copy.noun} is at revision ${revision}. Start a research change to redraw it.`}
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          <GeometryEditor
            key={revision}
            kind={kind}
            basemapUrl={BASEMAP_URL}
            referenceGeoJson={referenceGeometry}
            referenceLabel={referenceGeometry ? "study area" : null}
            initialGeoJson={geometry}
            currentRevision={revision}
            onSave={saveDrawnBoundaryAction.bind(null, projectId, kind)}
            initialBounds={bounds}
          />
          <div className="grid gap-4 border-t border-line pt-4 md:grid-cols-2">
            <ActionForm
              action={uploadBoundaryAction.bind(null, projectId, kind)}
              encType="multipart/form-data"
              className="flex flex-col gap-2"
            >
              <input type="hidden" name="expectedRevision" value={next} />
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Upload a boundary (.geojson, up to 2 MB)
                <input type="file" name="file" accept=".geojson,.json,application/geo+json,application/json" required className={inputClassName} />
              </label>
              <p className="text-xs text-muted">
                GeoJSON in longitude and latitude (WGS 84), with one polygon or several. UPlan checks it and rejects an
                invalid shape rather than repairing it.
              </p>
              <div>
                <SubmitButton variant="secondary" pendingLabel="Uploading…">
                  Upload boundary
                </SubmitButton>
              </div>
            </ActionForm>
            <ActionForm action={loadSampleBoundaryAction.bind(null, projectId, kind)} className="flex flex-col gap-2">
              <input type="hidden" name="expectedRevision" value={next} />
              <p className="text-sm font-medium">Use the sample {copy.noun}</p>
              <p className="text-xs text-muted">
                A fictional boundary, labeled as sample data wherever it appears, so you can see every phase work.
              </p>
              <div>
                <SubmitButton variant="secondary" pendingLabel="Loading…">
                  Load sample {copy.noun}
                </SubmitButton>
              </div>
            </ActionForm>
          </div>
        </div>
      )}
    </Panel>
  );
}
