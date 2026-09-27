import type { MultiPolygon } from "geojson";
import Link from "next/link";

import { phaseModel } from "@/app/_lib/phase-model";
import { loadProject } from "@/app/_lib/project";
import { projectHref } from "@/app/_lib/workflow-labels";
import { getLatestGeometry } from "@/modules/decisions";
import { boundsFromFirst } from "@/ui/geo-bounds";
import { Panel } from "@/ui/panel";
import { PhasePage } from "@/ui/phase/phase-page";

import { recordReviewAction } from "../actions";
import { BoundaryPanel } from "../_components/boundary-panel";

// Phase 5: the proposal's footprint, traced over the read-only study area (F8). The drafted output is the
// PostGIS-computed area of the traced footprint — the proposal under evaluation, never evidence.
export default async function FootprintPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { actor, workflow: w } = await loadProject(projectId);

  const [studyArea, footprint] = await Promise.all([
    getLatestGeometry(actor, projectId, "study_area"),
    getLatestGeometry(actor, projectId, "footprint"),
  ]);
  const studyAreaGeom = studyArea?.geom.type === "MultiPolygon" ? studyArea.geom : null;
  const footprintGeom = footprint?.geom.type === "MultiPolygon" ? footprint.geom : null;

  return (
    <PhasePage
      model={phaseModel(w, projectId, "footprint")}
      reviewAction={recordReviewAction.bind(null, projectId)}
      editor={
        studyAreaGeom ? (
          <BoundaryPanel
            projectId={projectId}
            kind="footprint"
            revision={footprint?.revision ?? 0}
            geometry={footprintGeom}
            referenceGeometry={studyAreaGeom}
            bounds={boundsFromFirstOrThrow(footprintGeom, studyAreaGeom)}
            readOnly={w.decisionStatus !== "in_progress"}
          />
        ) : (
          <Panel id="footprint" title="Footprint">
            <p className="text-sm text-text">
              The footprint is traced relative to the study area, so add the study area first, on the{" "}
              <Link href={projectHref(projectId, "site")} className="font-medium text-brand underline underline-offset-2">
                Site page
              </Link>
              .
            </p>
          </Panel>
        )
      }
    />
  );
}

function boundsFromFirstOrThrow(footprint: MultiPolygon | null, studyArea: MultiPolygon) {
  const bounds = boundsFromFirst([footprint, studyArea]);
  if (!bounds) throw new Error("a saved study area produced no bounds");
  return bounds;
}
