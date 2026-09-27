import { eq, inArray } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";

import { getRun, getRunDatasetVersionIds, readRunResults, listResolutionsInternal, type AnalysisResults } from "@/modules/analysis";
import { getDecisionForAnalysis, getGeometrySvgInternal } from "@/modules/decisions";
import { getDatasetVersionProvenance, getDatasetVersionQuality } from "@/modules/evidence";
import {
  ProfileDocumentSchema,
  findRuleCitation,
  getJurisdiction,
  getProfileVersion,
  type ProfileDocument,
} from "@/modules/profiles";
import type { DerivedProvenance, EvidenceProvenance } from "@/modules/provenance";
import { appUser } from "@/platform/auth-tables";
import { db } from "@/platform/db";
import { ValidationError } from "@/platform/errors";

import { ReportDocument, type ReportResolution } from "./document";
import { ReportSnapshotSchema } from "./snapshot";
import { report } from "./tables";

// TechDesign/locked-report.md — renderReportHtml. F10 R17 / F22 R11: the document is built ONLY from
// pinned records: the report row and its snapshot, the run it names, the geometry revisions that run
// recorded, the profile version the snapshot names, the dataset versions the run pinned, and the
// resolutions the snapshot lists. It reads no "current" profile and no "latest" geometry, so a later
// change can never alter what a retry renders.

/** R2/R4 of provenance.md: every derived figure carries every source it came from, resolved from the run's own evidence/rule ids — never invented at render time. */
function buildImpactProvenance(
  results: AnalysisResults,
  profileDocument: ProfileDocument,
  datasetProvenance: Map<string, EvidenceProvenance>,
): Map<string, DerivedProvenance> {
  const provenance = new Map<string, DerivedProvenance>();
  for (const impact of results.impacts) {
    const evidence = impact.evidence.map((e) => {
      const found = datasetProvenance.get(e.datasetVersionId);
      if (!found) throw new Error(`impact ${impact.impactKey} cites dataset version ${e.datasetVersionId}, which the run did not pin`);
      return found;
    });
    const rules = impact.ruleKeys
      .map((key) => findRuleCitation(profileDocument, key))
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .map((r) => ({ ...r.citation, effectiveOn: r.effectiveOn }));
    provenance.set(impact.impactKey, { rules, evidence });
  }
  return provenance;
}

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

  const versionIds = await getRunDatasetVersionIds(run.id);
  const datasetProvenance = new Map<string, EvidenceProvenance>();
  const datasetTitles = new Map<string, string>();
  const datasetLimitations = new Map<string, string>();
  for (const versionId of versionIds) {
    datasetProvenance.set(versionId, await getDatasetVersionProvenance(versionId));
    const quality = await getDatasetVersionQuality(versionId);
    datasetTitles.set(versionId, quality.datasetTitle);
    if (quality.knownLimitation) datasetLimitations.set(versionId, quality.knownLimitation);
  }

  // The resolutions the snapshot lists, at exactly the revisions that were shown.
  const allResolutions = await listResolutionsInternal(decision.id);
  const shown = snapshot.resolutions.map((s) => {
    const found = allResolutions.find(
      (r) => r.resourceTypeKey === s.resourceType && r.mappedBy === s.mappedBy && r.notMappedBy === s.notMappedBy && r.revision === s.revision,
    );
    if (!found) throw new Error(`the snapshot names a resolution (${s.resourceType} revision ${s.revision}) that does not exist`);
    return found;
  });
  const authorIds = [...new Set(shown.map((r) => r.createdBy))];
  const authors =
    authorIds.length === 0 ? [] : await db.select({ id: appUser.id, name: appUser.name }).from(appUser).where(inArray(appUser.id, authorIds));
  const authorName = (id: string): string => authors.find((a) => a.id === id)?.name ?? "Unknown person";
  const resolutions: ReportResolution[] = shown.map((r) => ({
    resourceType: r.resourceTypeKey,
    mappedByTitle: datasetTitles.get(r.mappedBy) ?? r.mappedBy,
    notMappedByTitle: datasetTitles.get(r.notMappedBy) ?? r.notMappedBy,
    revision: r.revision,
    reliedOn: r.reliedOn as ReportResolution["reliedOn"],
    rationale: r.rationale,
    createdByName: authorName(r.createdBy),
    createdAt: r.createdAt,
  }));

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
