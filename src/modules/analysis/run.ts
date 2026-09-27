import { and, desc, eq, ne } from "drizzle-orm";

import { db } from "@/platform/db";
import { isUniqueViolation } from "@/platform/errors";

import { buildEvidenceBase, collectLimits } from "./evidence-base";
import { computeImpacts } from "./impact";
import { pinInputs, type Clock } from "./pin-inputs";
import { AnalysisResultsSchema, RESULTS_VERSION, orderResults, type AnalysisResults } from "./results";
import { computeScreening, computeStudyFlags } from "./screening";
import { analysisRun, analysisRunDataset } from "./tables";

// TechDesign/evidence-base.md — the run_analysis job body (J2), shared by F7, F9, and F14. Every run
// pins its inputs once (pin-inputs.ts), before computing anything, and never re-reads "current"
// mid-computation (.claude/rules/conventions.md: "Never read 'current' twice within one computation").

export async function runAnalysis(
  decisionId: string,
  purpose: "current" | "preview",
  profileChangeId?: string,
  clock?: Clock,
): Promise<void> {
  const pin = await pinInputs(decisionId, purpose, profileChangeId, clock);
  if (pin.kind !== "ready") return; // nothing to analyze yet: no study area, or no approved profile (the status says which)
  const p = pin.pinned;

  // R8: identical pinned inputs never recompute. A failed run is final and does not count (the unique
  // index skips failed rows), so a retry after a failure computes again.
  const [existing] = await db
    .select({ id: analysisRun.id, status: analysisRun.status })
    .from(analysisRun)
    .where(
      and(
        eq(analysisRun.decisionId, decisionId),
        eq(analysisRun.purpose, purpose),
        eq(analysisRun.inputSha256, p.inputSha256),
        ne(analysisRun.status, "failed"),
      ),
    );
  if (existing?.status === "succeeded") return;

  // A run left `running` by an attempt whose process died is taken over and finished: jobs for one
  // decision are serialized on its own queue, so a running row seen at the start of a job is dead.
  let runId = existing?.id;
  if (!runId) {
    try {
      runId = await db.transaction(async (tx) => {
        const [run] = await tx
          .insert(analysisRun)
          .values({
            decisionId,
            purpose,
            profileVersionId: p.profileVersionId,
            profileChangeId: p.profileChangeId,
            rulesResolvedFor: p.resolvedFor,
            studyAreaRevision: p.studyArea.revision,
            footprintRevision: p.footprint?.revision ?? null,
            resultsVersion: p.resultsVersion,
            inputSha256: p.inputSha256,
            status: "running",
          })
          .returning({ id: analysisRun.id });
        if (!run) throw new Error("insert into analysis_run unexpectedly returned no row");
        if (p.datasetVersionIds.length > 0) {
          await tx
            .insert(analysisRunDataset)
            .values(p.datasetVersionIds.map((id) => ({ analysisRunId: run.id, datasetVersionId: id })));
        }
        return run.id;
      });
    } catch (err) {
      // Another attempt inserted the same run between our check and our insert: it is computing it.
      if (isUniqueViolation(err)) return;
      throw err;
    }
  }

  try {
    const srid = p.jurisdiction.analysisSrid; // e.g. 2926 for Sammamish (tech-stack.md)
    const evidenceBase = await buildEvidenceBase(p.rules.resourceTypes, p.mappings, p.studyArea.geom, srid);
    const impacts = p.footprint
      ? await computeImpacts(p.rules.resourceTypes, p.rules.bufferRules, p.mappings, p.footprint.geom, srid)
      : [];
    // F14 R11: screening and study flags need the study area only, so they exist before any footprint.
    const screening = await computeScreening(p.rules, p.mappings, p.studyArea.geom, srid);
    const studyFlags = await computeStudyFlags(p.rules, p.mappings, p.studyArea.geom, srid);
    const results: AnalysisResults = orderResults({
      impacts,
      evidenceBase,
      screening,
      studyFlags,
      limits: collectLimits(p.mappings, p.rules.resourceTypes),
    });

    await db
      .update(analysisRun)
      .set({ status: "succeeded", results, finishedAt: new Date() })
      .where(and(eq(analysisRun.id, runId), eq(analysisRun.status, "running")));
  } catch (err) {
    await db
      .update(analysisRun)
      .set({
        status: "failed",
        errorDetail: err instanceof Error ? err.message : String(err),
        finishedAt: new Date(),
      })
      .where(and(eq(analysisRun.id, runId), eq(analysisRun.status, "running")));
    throw err; // still a job failure: recorded and shown, and the retry computes again
  }
}

export async function getRun(runId: string) {
  const [row] = await db.select().from(analysisRun).where(eq(analysisRun.id, runId));
  return row ?? null;
}

/**
 * The results of a run, parsed — or null when the run was written at another results version, so a
 * caller shows "predates study scoping" instead of parsing an old document as best it can (study-scoping.md).
 */
export function readRunResults(run: { resultsVersion: number; results: unknown }): AnalysisResults | null {
  if (run.resultsVersion !== RESULTS_VERSION) return null;
  return AnalysisResultsSchema.parse(run.results); // untyped jsonb: parsed, never `as`-cast
}

/** The dataset versions a run pinned (F22 R11: a document lists exactly these, never "the current ones"). Sorted. */
export async function getRunDatasetVersionIds(runId: string): Promise<string[]> {
  const rows = await db
    .select({ datasetVersionId: analysisRunDataset.datasetVersionId })
    .from(analysisRunDataset)
    .where(eq(analysisRunDataset.analysisRunId, runId));
  return rows.map((r) => r.datasetVersionId).sort();
}

/** The most recent succeeded run of a purpose for a decision, at any results version. */
export async function getLatestSucceededRun(decisionId: string, purpose: "current" | "preview") {
  const [row] = await db
    .select()
    .from(analysisRun)
    .where(
      and(eq(analysisRun.decisionId, decisionId), eq(analysisRun.purpose, purpose), eq(analysisRun.status, "succeeded")),
    )
    .orderBy(desc(analysisRun.startedAt))
    .limit(1);
  return row ?? null;
}
