import { and, desc, eq } from "drizzle-orm";

import type { Actor } from "@/modules/accounts";
import { getDecision } from "@/modules/decisions";
import { db } from "@/platform/db";
import { ValidationError } from "@/platform/errors";

import { pinInputs, type Clock, type PinnedInputs, type PinResult } from "./pin-inputs";
import { analysisRun, analysisRunDataset } from "./tables";

// TechDesign/decision-overview.md (F18 R7): whether the analysis for the decision's CURRENT inputs
// exists, is running, failed, or is still to come — and what changed since the last run the planner
// saw. It calls pinInputs once, the same function the run computes with, so this answer and a run
// can't disagree about what "current" is.

export type InputChange =
  | { kind: "study-area"; from: number | null; to: number }
  | { kind: "footprint"; from: number | null; to: number } // from is null when this is the first footprint
  | { kind: "profile-version" }
  | { kind: "rules-in-force" } // a rule took effect or was repealed, so the set of rules in force differs
  | { kind: "dataset-version"; datasetKey: string }
  | { kind: "results-version" }; // the analysis engine's own output shape changed

export type AnalysisStatus =
  | { kind: "none"; reason: "no-study-area" | "no-profile" } // there is nothing to analyze yet
  | { kind: "blocked"; reason: string } // the inputs can't be pinned: for example a vesting rule set with no filing date
  | { kind: "current"; runId: string }
  | { kind: "running"; runId: string }
  | { kind: "failed"; runId: string; errorDetail: string }
  | { kind: "out-of-date"; changes: InputChange[] }; // no run exists for the current inputs: queued, or not yet enqueued

export async function getAnalysisStatus(actor: Actor, decisionId: string, clock?: Clock): Promise<AnalysisStatus> {
  await getDecision(actor, decisionId); // ownership (accounts-roles.md R3)
  return getAnalysisStatusInternal(decisionId, clock);
}

/** The status together with the inputs it was computed from, so a caller that also needs them (the phase outputs) reads them once. */
export type AnalysisSnapshot = { status: AnalysisStatus; pinned: PinnedInputs | null };

/**
 * The status without an ownership check, for callers that have already authorized the decision (the
 * workflow module inside its own locked transaction). A vesting rule set with no filing date can't be
 * pinned: pinInputs throws its ValidationError, and it is returned here as the `blocked` status with the
 * same message, so the page shows the reason and no default date stands in for the missing one (F1 R3).
 */
export async function getAnalysisStatusInternal(decisionId: string, clock?: Clock): Promise<AnalysisStatus> {
  return (await getAnalysisSnapshot(decisionId, clock)).status;
}

export async function getAnalysisSnapshot(decisionId: string, clock?: Clock): Promise<AnalysisSnapshot> {
  let pin: PinResult;
  try {
    pin = await pinInputs(decisionId, "current", undefined, clock);
  } catch (err) {
    // An expected outcome, translated at this boundary; anything else is a defect and propagates.
    if (err instanceof ValidationError) return { status: { kind: "blocked", reason: err.message }, pinned: null };
    throw err;
  }
  if (pin.kind !== "ready") {
    return { status: { kind: "none", reason: pin.kind === "no-study-area" ? "no-study-area" : "no-profile" }, pinned: null };
  }
  const p = pin.pinned;

  const runs = await db
    .select({ id: analysisRun.id, status: analysisRun.status, errorDetail: analysisRun.errorDetail })
    .from(analysisRun)
    .where(
      and(
        eq(analysisRun.decisionId, decisionId),
        eq(analysisRun.purpose, "current"),
        eq(analysisRun.inputSha256, p.inputSha256),
      ),
    )
    .orderBy(desc(analysisRun.startedAt));

  const succeeded = runs.find((r) => r.status === "succeeded");
  if (succeeded) return { status: { kind: "current", runId: succeeded.id }, pinned: p };
  const running = runs.find((r) => r.status === "running");
  if (running) return { status: { kind: "running", runId: running.id }, pinned: p };
  const failed = runs.find((r) => r.status === "failed");
  if (failed) {
    // analysis_run_failed_shape guarantees a failed run has its error recorded.
    return {
      status: { kind: "failed", runId: failed.id, errorDetail: failed.errorDetail ?? "The analysis failed." },
      pinned: p,
    };
  }
  return { status: { kind: "out-of-date", changes: await changesSinceLastRun(p) }, pinned: p };
}

/**
 * What differs between the current inputs and the latest run the planner could have seen. The hash
 * carries the study area, the footprint, the profile version, the rules in force, the datasets, and the
 * results version; the run records all of those except the rules in force. So when nothing else
 * explains the difference, the rules in force are what changed.
 */
async function changesSinceLastRun(p: PinnedInputs): Promise<InputChange[]> {
  const [last] = await db
    .select()
    .from(analysisRun)
    .where(
      and(
        eq(analysisRun.decisionId, p.decision.id),
        eq(analysisRun.purpose, "current"),
        eq(analysisRun.status, "succeeded"),
      ),
    )
    .orderBy(desc(analysisRun.startedAt))
    .limit(1);
  if (!last) return []; // never analyzed: the page says the first analysis is on its way

  const lastDatasetRows = await db
    .select({ datasetVersionId: analysisRunDataset.datasetVersionId })
    .from(analysisRunDataset)
    .where(eq(analysisRunDataset.analysisRunId, last.id));
  const lastDatasets = new Set(lastDatasetRows.map((r) => r.datasetVersionId));

  const changes: InputChange[] = [];
  if (last.resultsVersion !== p.resultsVersion) changes.push({ kind: "results-version" });
  if (last.studyAreaRevision !== p.studyArea.revision) {
    changes.push({ kind: "study-area", from: last.studyAreaRevision, to: p.studyArea.revision });
  }
  if (p.footprint && last.footprintRevision !== p.footprint.revision) {
    changes.push({ kind: "footprint", from: last.footprintRevision, to: p.footprint.revision });
  }
  if (last.profileVersionId !== p.profileVersionId) changes.push({ kind: "profile-version" });
  for (const m of p.mappings) {
    if (m.dataset.currentVersionId !== null && !lastDatasets.has(m.dataset.currentVersionId)) {
      changes.push({ kind: "dataset-version", datasetKey: m.dataset.key });
    }
  }
  if (changes.length === 0) changes.push({ kind: "rules-in-force" });
  return changes;
}
