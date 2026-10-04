import { getRun, listResolutionsInternal, matchResolutions, readRunResults } from "@/modules/analysis";
import { getGeometrySvgInternal, type GeometrySvg } from "@/modules/decisions";
import { ProfileDocumentSchema, getJurisdiction, getProfileVersion } from "@/modules/profiles";

import { buildImpactProvenance, loadRunSources, toReportResolutions } from "./run-content";
import type { RunContent } from "./sections";

// TechDesign/locked-report.md, "Live preview" — what a step page embeds so the planner reads the section the
// step will contribute to the document. It resolves the SAME content the final document does (run-content.ts)
// and renders the same section components, but from the inputs the caller pinned for this page view: the run
// and the geometry revisions it was handed, never "current" read a second time (conventions.md). It is a
// preview, not a record: nothing is stored, and the released document is still built only from a report row's
// pinned snapshot (render.ts). System authority: the caller has already reached the decision through
// getDecision (the project layout's loadProject).

export type LiveReportContent = {
  studyAreaSvg: GeometrySvg | null;
  footprintSvg: GeometrySvg | null;
  /** Null until an analysis of the current inputs has finished. */
  run: RunContent | null;
};

export async function loadLiveReportContent(input: {
  decisionId: string;
  jurisdictionId: string;
  runId: string | null;
  studyAreaRevision: number | null;
  footprintRevision: number | null;
}): Promise<LiveReportContent> {
  const jurisdiction = await getJurisdiction(input.jurisdictionId);
  const svg = (kind: "study_area" | "footprint", revision: number | null) =>
    revision === null ? Promise.resolve(null) : getGeometrySvgInternal(input.decisionId, kind, revision, jurisdiction.analysisSrid);
  const [studyAreaSvg, footprintSvg] = await Promise.all([svg("study_area", input.studyAreaRevision), svg("footprint", input.footprintRevision)]);

  if (input.runId === null) return { studyAreaSvg, footprintSvg, run: null };

  const runRow = await getRun(input.runId);
  const results = runRow ? readRunResults(runRow) : null;
  if (!runRow || !results) throw new Error(`run ${input.runId} could not be read at the current results version`);
  if (runRow.profileVersionId === null) throw new Error(`run ${input.runId} has no profile version`);
  const profileVersion = await getProfileVersion(runRow.profileVersionId);
  const profileDocument = ProfileDocumentSchema.parse(profileVersion.document);
  const sources = await loadRunSources(runRow.id);

  // The same resolutions the document would list: the latest note for each disagreement this run has.
  const matched = matchResolutions(results.evidenceBase.disagreements, await listResolutionsInternal(input.decisionId));
  const shown = matched.disagreements.flatMap((m) => (m.resolution === null ? [] : [m.resolution]));

  return {
    studyAreaSvg,
    footprintSvg,
    run: {
      timeZone: jurisdiction.timeZone,
      profileVersionNumber: profileVersion.versionNumber,
      profileDocument,
      rulesResolvedFor: runRow.rulesResolvedFor,
      results,
      impactProvenance: buildImpactProvenance(results, profileDocument, sources.datasetProvenance),
      datasetProvenance: sources.datasetProvenance,
      datasetTitles: sources.datasetTitles,
      datasetLimitations: sources.datasetLimitations,
      resolutions: await toReportResolutions(shown, sources.datasetTitles),
    },
  };
}
