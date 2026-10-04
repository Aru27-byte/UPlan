import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";

import { getRun, readRunResults, listResolutionsInternal } from "@/modules/analysis";
import { getDecisionForAnalysis, getGeometrySvgInternal } from "@/modules/decisions";
import { ProfileDocumentSchema, getJurisdiction, getProfileVersion } from "@/modules/profiles";
import { db } from "@/platform/db";
import { ValidationError } from "@/platform/errors";

import { ReportDocument } from "./document";
import { buildImpactProvenance, loadRunSources, toReportResolutions } from "./run-content";
import { ReportSnapshotSchema } from "./snapshot";
import { report } from "./tables";

// TechDesign/locked-report.md — renderReportHtml. F10 R17 / F22 R11: the document is built ONLY from
// pinned records: the report row and its snapshot, the run it names, the geometry revisions that run
// recorded, the profile version the snapshot names, the dataset versions the run pinned, and the
// resolutions the snapshot lists. It reads no "current" profile and no "latest" geometry, so a later
// change can never alter what a retry renders.

export async function renderReportHtml(reportId: string): Promise<string> {
  const [row] = await db.select().from(report).where(eq(report.id, reportId));
  if (!row) throw new Error(`report ${reportId} not found`);
  const snapshot = ReportSnapshotSchema.parse(row.snapshot); // untyped jsonb: parsed, never `as`-cast

  const run = await getRun(row.analysisRunId);
  if (!run) throw new Error(`analysis run ${row.analysisRunId} for report ${reportId} not found`);
  const results = readRunResults(run);
  if (!results) throw new ValidationError(`analysis run ${run.id} predates study scoping and can't be published`);
  if (run.profileVersionId !== snapshot.profileVersionId) {
    throw new Error(`report ${reportId} names profile version ${snapshot.profileVersionId} but its run used ${String(run.profileVersionId)}`);
  }

  const decision = await getDecisionForAnalysis(row.decisionId);
  const jurisdiction = await getJurisdiction(decision.jurisdictionId);
  const profileVersion = await getProfileVersion(snapshot.profileVersionId);
  const profileDocument = ProfileDocumentSchema.parse(profileVersion.document);

  const studyAreaSvg = await getGeometrySvgInternal(decision.id, "study_area", run.studyAreaRevision, jurisdiction.analysisSrid);
  if (!studyAreaSvg) throw new Error(`study area revision ${run.studyAreaRevision} of ${decision.id} not found`);
  const footprintSvg =
    run.footprintRevision === null
      ? null
      : await getGeometrySvgInternal(decision.id, "footprint", run.footprintRevision, jurisdiction.analysisSrid);

  const { datasetProvenance, datasetTitles, datasetLimitations } = await loadRunSources(run.id);

  // The resolutions the snapshot lists, at exactly the revisions that were shown.
  const allResolutions = await listResolutionsInternal(decision.id);
  const shown = snapshot.resolutions.map((s) => {
    const found = allResolutions.find(
      (r) => r.resourceTypeKey === s.resourceType && r.mappedBy === s.mappedBy && r.notMappedBy === s.notMappedBy && r.revision === s.revision,
    );
    if (!found) throw new Error(`the snapshot names a resolution (${s.resourceType} revision ${s.revision}) that does not exist`);
    return found;
  });
  const resolutions = await toReportResolutions(shown, datasetTitles);

  const html = renderToStaticMarkup(
    ReportDocument({
      cityName: jurisdiction.name,
      stateCode: jurisdiction.stateCode,
      timeZone: jurisdiction.timeZone,
      // Version numbers have no gaps and one finish is in flight per project, so the number this
      // attempt will get is the previous version plus one; render-and-store.ts checks it when storing.
      versionNumber: (snapshot.previousVersion ?? 0) + 1,
      requestedAt: row.requestedAt,
      changeNote: row.changeNote,
      snapshot,
      profileVersionNumber: profileVersion.versionNumber,
      profileDocument,
      rulesResolvedFor: run.rulesResolvedFor,
      results,
      impactProvenance: buildImpactProvenance(results, profileDocument, datasetProvenance),
      datasetProvenance,
      datasetTitles,
      datasetLimitations,
      resolutions,
      studyAreaSvg,
      footprintSvg,
    }),
  );
  return `<!doctype html>${html}`;
}
