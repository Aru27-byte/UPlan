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
  // Each wave below is a set of independent reads that overlap; a wave starts only when it needs something
  // an earlier wave returned (the srid, the pinned revisions, the run id). This runs on every project page,
  // and each sequential read is a full database round trip.
  const [jurisdiction, { status, pinned }, resolutionRows] = await Promise.all([
    getJurisdiction(decision.jurisdictionId),
    getAnalysisSnapshot(decision.id, clock),
    listResolutionsInternal(decision.id),
  ]);
  const srid = jurisdiction.analysisSrid;

  // With pinned inputs, read exactly the revisions the run used. Without them, the latest is all there is.
  const summary = (kind: "study_area" | "footprint", pinnedRevision: number | null | undefined) => {
    if (pinned === null) return getGeometrySummaryInternal(decision.id, kind, srid);
    if (pinnedRevision === null || pinnedRevision === undefined) return Promise.resolve(null);
    return getGeometrySummaryInternal(decision.id, kind, srid, undefined, pinnedRevision);
  };
  const [studyArea, footprint]: [GeometrySummary | null, GeometrySummary | null] = await Promise.all([
    summary("study_area", pinned?.studyArea.revision),
    summary("footprint", pinned?.footprint?.revision),
  ]);

  const datasetTitles = new Map<string, string>();
  const datasetLimitations = new Map<string, string>();
  let usesSampleData = [studyArea, footprint].some((g) => g !== null && isSampleNote(g.sourceNote));
  let run: PhaseFacts["run"] = null;

  if (status.kind === "current") {
    if (!pinned?.profileVersionId) throw new Error(`current run ${status.runId} has no pinned profile version`);
    const [runRow, datasetVersionIds, profileVersion] = await Promise.all([
      getRun(status.runId),
      getRunDatasetVersionIds(status.runId),
      getProfileVersion(pinned.profileVersionId),
    ]);
    const results = runRow ? readRunResults(runRow) : null;
    // The run's input hash includes the results version, so a current run is at the current version.
    if (!runRow || !results) throw new Error(`current run ${status.runId} could not be read at the current results version`);
    const qualities = await Promise.all(datasetVersionIds.map((versionId) => getDatasetVersionQuality(versionId)));
    datasetVersionIds.forEach((versionId, index) => {
      const quality = qualities[index];
      if (!quality) throw new Error(`dataset version ${versionId} has no quality record`);
      datasetTitles.set(versionId, quality.datasetTitle);
      if (quality.knownLimitation) datasetLimitations.set(versionId, quality.knownLimitation);
      if (quality.isSample) usesSampleData = true;
    });
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
      // The rules the pinned inputs resolved, whether or not a run has finished: the Overview lists them (F18 R8).
      // Phase outputs still need the run as well (missingReason).
      rules: pinned ? pinned.rules : null,
      resolvedFor: pinned ? pinned.resolvedFor : null,
      datasetTitles,
      datasetLimitations,
      resolutions: latestResolutions(resolutionRows),
    },
    usesSampleData,
    cityName: jurisdiction.name,
    timeZone: jurisdiction.timeZone,
  };
}
