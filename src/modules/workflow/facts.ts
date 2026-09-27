import {
  getAnalysisSnapshot,
  getRun,
  getRunDatasetVersionIds,
  latestResolutions,
  listResolutionsInternal,
  readRunResults,
  type Clock,
} from "@/modules/analysis";
import { getGeometrySummaryInternal, isSampleNote, type Decision, type GeometrySummary } from "@/modules/decisions";
import { getDatasetVersionQuality } from "@/modules/evidence";
import { getJurisdiction, getProfileVersion } from "@/modules/profiles";

import type { PhaseFacts } from "./phases";

// TechDesign/research-phases.md. The reads behind the phase outputs. `getAnalysisSnapshot` pins the
// inputs ONCE and returns both the status and what it was computed from, so the outputs below are drafted
// from the same inputs the run used: the geometry revisions are the pinned ones, never re-read as "latest"
// (conventions.md: "Never read 'current' twice within one computation"). System authority: the caller has
// already reached the decision through getDecision or lockEditableDecision.

export type LoadedFacts = { facts: PhaseFacts; usesSampleData: boolean; cityName: string; timeZone: string };

export async function loadPhaseFacts(decision: Decision, clock?: Clock): Promise<LoadedFacts> {
  const jurisdiction = await getJurisdiction(decision.jurisdictionId);
  const { status, pinned } = await getAnalysisSnapshot(decision.id, clock);
  const srid = jurisdiction.analysisSrid;

  // With pinned inputs, read exactly the revisions the run used. Without them, the latest is all there is.
  const summary = (kind: "study_area" | "footprint", pinnedRevision: number | null | undefined) => {
    if (pinned === null) return getGeometrySummaryInternal(decision.id, kind, srid);
    if (pinnedRevision === null || pinnedRevision === undefined) return Promise.resolve(null);
    return getGeometrySummaryInternal(decision.id, kind, srid, undefined, pinnedRevision);
  };
  const studyArea: GeometrySummary | null = await summary("study_area", pinned?.studyArea.revision);
  const footprint: GeometrySummary | null = await summary("footprint", pinned?.footprint?.revision);

  const datasetTitles = new Map<string, string>();
  const datasetLimitations = new Map<string, string>();
  let usesSampleData = [studyArea, footprint].some((g) => g !== null && isSampleNote(g.sourceNote));
  let run: PhaseFacts["run"] = null;

  if (status.kind === "current") {
    const runRow = await getRun(status.runId);
    const results = runRow ? readRunResults(runRow) : null;
    // The run's input hash includes the results version, so a current run is at the current version.
    if (!runRow || !results) throw new Error(`current run ${status.runId} could not be read at the current results version`);
    if (!pinned?.profileVersionId) throw new Error(`current run ${status.runId} has no pinned profile version`);
    const datasetVersionIds = await getRunDatasetVersionIds(status.runId);
    for (const versionId of datasetVersionIds) {
      const quality = await getDatasetVersionQuality(versionId);
      datasetTitles.set(versionId, quality.datasetTitle);
      if (quality.knownLimitation) datasetLimitations.set(versionId, quality.knownLimitation);
      if (quality.isSample) usesSampleData = true;
    }
    const profileVersion = await getProfileVersion(pinned.profileVersionId);
    run = {
      id: status.runId,
      results,
      profileVersionId: pinned.profileVersionId,
      profileVersionNumber: profileVersion.versionNumber,
      datasetVersionIds,
    };
  }

  return {
    facts: {
      studyArea,
      footprint,
      status,
      run,
      rules: run && pinned ? pinned.rules : null,
      datasetTitles,
      datasetLimitations,
      resolutions: latestResolutions(await listResolutionsInternal(decision.id)),
    },
    usesSampleData,
    cityName: jurisdiction.name,
    timeZone: jurisdiction.timeZone,
  };
}
