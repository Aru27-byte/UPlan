# TechDesign — Evidence Base

**Feature:** F7 · `analysis`
**Status:** Draft
**Requirements:** [Requirements/evidence-base.md](../Requirements/evidence-base.md) (R1–R8)
**Builds on:** [system-architecture.md](system-architecture.md) (_Key flows: Analysis run_, _Impact engine_), [data-model.md](data-model.md) (`analysis_run`, `analysis_run_dataset`)
**Shared module with:** [impact-analysis.md](impact-analysis.md) (F9 — the other half of the same run's results)
**Release:** 1

## Module

```
src/modules/analysis/
  index.ts          public API: getRun, getRunDatasetVersionIds, getLatestSucceededRun, readRunResults, getAnalysisSnapshot
  tables.ts           analysis_run, analysis_run_dataset
  pin-inputs.ts         pinInputs: the one read of a run's inputs, shared with status.ts (F18)
  status.ts             getAnalysisStatus — see decision-overview.md
  run.ts               the run_analysis job body: pin inputs, orchestrate, store results
  evidence-base.ts      buildEvidenceBase — this feature
  screening.ts          computeScreening, computeStudyFlags — see study-scoping.md
  resolutions.ts        saveResolution, listResolutions — see evidence-review.md
  impact.ts             the impact engine — see impact-analysis.md
  results.ts            AnalysisResults, Impact, Disagreement, Gap, Limit, ScreeningRow, StudyFlag, RESULTS_VERSION (as in data-model.md)
  *.test.ts
```

`enqueueAnalysisRun` itself lives in `src/platform/jobs.ts`, not this module's `index.ts`: `run.ts` imports `profiles`, `decisions`, and `evidence` to compute a run, and those same three modules are exactly the callers that need to enqueue one — putting the enqueue function in `analysis`'s public API would make importing it an import cycle (`.claude/rules/conventions.md`: "No import cycles; lint enforces this"). The platform version carries no domain logic, only the fixed queue-name/job-key convention for the `run_analysis` task.

`run.ts` is described in full here, since F7 is the first analysis feature; `impact-analysis.md` (F9) builds directly on the same run without repeating it.

## Triggering and pinning a run (R5, R8; shared with F9)

```ts
// run.ts — the run_analysis job handler, queue `decision:<id>`, job key `run_analysis:<id>`
export async function runAnalysis(
  decisionId: string,
  purpose: "current" | "preview",
  profileChangeId?: string,
) {
  // One read of every input, shared with getAnalysisStatus (see decision-overview.md). It returns
  // null when the decision has no study area yet, so the job has nothing to do.
  const pinned = await pinInputs(decisionId, purpose, profileChangeId);
  if (!pinned) return;
  const { studyArea, footprint, rules, resolvedFor, mappings, datasetVersionIds, inputSha256, srid } = pinned; // srid: the jurisdiction's analysis_srid

  const existing = await findRunByInputHash(decisionId, purpose, inputSha256);
  if (existing) return; // R8's determinism means an identical run is redundant, never recomputed

  const [run] = await db
    .insert(analysisRun)
    .values({
      decisionId,
      purpose,
      profileVersionId: purpose === "current" ? pinned.profileVersionId : null,
      profileChangeId: purpose === "preview" ? profileChangeId : null,
      rulesResolvedFor: resolvedFor,
      studyAreaRevision: studyArea.revision,
      footprintRevision: footprint?.revision ?? null,
      resultsVersion: RESULTS_VERSION, // study-scoping.md: also part of inputSha256
      inputSha256,
      status: "running",
    })
    .returning();
  await db
    .insert(analysisRunDataset)
    .values(datasetVersionIds.map((id) => ({ analysisRunId: run.id, datasetVersionId: id })));

  try {
    const evidenceBase = await buildEvidenceBase(rules, mappings, studyArea.geom); // this feature
    const impacts = footprint ? await computeImpacts(rules, mappings, footprint.geom, srid) : []; // F9
    const screening = await computeScreening(rules, mappings, studyArea.geom, srid); // F14
    const studyFlags = await computeStudyFlags(rules, mappings, studyArea.geom, srid); // F14
    const results: AnalysisResults = {
      impacts,
      evidenceBase,
      screening,
      studyFlags,
      limits: collectLimits(mappings, rules),
    };
    await db
      .update(analysisRun)
      .set({ status: "succeeded", results, finishedAt: sql`now()` })
      .where(and(eq(analysisRun.id, run.id), eq(analysisRun.status, "running")));
  } catch (err) {
    await db
      .update(analysisRun)
      .set({ status: "failed", errorDetail: String(err), finishedAt: sql`now()` })
      .where(and(eq(analysisRun.id, run.id), eq(analysisRun.status, "running")));
    throw err;
  }
}
```

- **R5:** `pinInputs` reads the study area, footprint, profile, rule dates, and dataset versions once, then hashes them into `inputSha256` before the run is inserted with its `analysis_run_dataset` rows — nothing later in this function re-queries "the current version" of anything (`conventions.md`: "Never read 'current' twice within one computation"). The read lives in `pin-inputs.ts` and `getAnalysisStatus` (F18) calls the same function, so a page and a run can't disagree about what "current" was. It returns `null` only when there is no study area. The hash it computes carries `resultsVersion`, the revisions, the profile version, the sorted keys of the rules in force, and the sorted dataset version ids. It carries the rules in force rather than the date they were resolved for, so a run doesn't go out of date at midnight (`decision-overview.md`, _Pinned inputs_). For a vesting rule set with no filing date it throws `ValidationError` before any run row exists, so the job ends with that error, is not retried (a validation error can't succeed on a second attempt), and writes no run. `getAnalysisStatus` calls the same function and shows the planner the same message. Nothing defaults a date.
- **R8:** `findRunByInputHash` (backed by `unique (decision_id, purpose, input_sha256)`) makes a rerun of identical inputs a no-op read, and `results` is built by pure functions over the pinned geometry and rule sets, with deterministic ordering (see `results.ts` below) — the same inputs produce the same JSON every time, which the golden-fixture tests assert byte-for-byte.

## Building the evidence base (R1, R2, R3, R4, R6, R7)

```ts
// evidence-base.ts
export async function buildEvidenceBase(
  rules: InForceRules,
  mappings: JurisdictionDatasetMapping[],
  studyAreaGeom: Geometry,
): Promise<{ disagreements: Disagreement[]; gaps: Gap[] }> {
  const disagreements: Disagreement[] = [];
  const gaps: Gap[] = [];

  for (const resourceType of rules.resourceTypes) {
    // R1: every resource type in the resolved profile
    const mapped = mappings.filter((m) => m.resourceTypeKey === resourceType.key);
    if (mapped.length === 0) {
      gaps.push({ resourceType: resourceType.key, reason: "no-dataset-mapped" });
      continue;
    } // R4

    const inCoverage = mapped.filter((m) => intersectsCoverage(m.dataset.coverage, studyAreaGeom));
    if (inCoverage.length === 0) {
      gaps.push({ resourceType: resourceType.key, reason: "coverage-excludes-study-area" });
      continue;
    } // R4

    // R3: pairwise, never a single "winner" — every dataset's presence/absence over the study
    // area is compared against every other mapped dataset's, in both directions.
    for (const [a, b] of pairs(inCoverage)) {
      const areaOnlyInA = await sql`
        select ST_Area(ST_Transform(ST_Intersection(
          ST_Union(a.geom), ST_Difference(${studyAreaGeom}, ST_Union(b.geom))
        ), ${analysisSrid})) as area
        from evidence_feature a, evidence_feature b
        where a.dataset_version_id = ${a.dataset.currentVersionId} and ST_Intersects(a.geom, ${studyAreaGeom})
          and b.dataset_version_id = ${b.dataset.currentVersionId}`;
      if (areaOnlyInA.area > 0) {
        disagreements.push({
          resourceType: resourceType.key,
          mappedBy: a.dataset.currentVersionId,
          notMappedBy: b.dataset.currentVersionId,
          area: areaOnlyInA.area,
          unit: "us-survey-sq-ft",
        }); // R2 via provenance ids
      }
    }
  }
  return { disagreements, gaps };
}
```

- **R2:** `disagreements`/`gaps` carry `dataset_version_id`s and `resourceType` keys, not rendered text — the caller (F9's results assembly, and `reports`/`map-workspace`) resolves those ids through `evidence`'s dataset-version lookups and `formatEvidenceProvenance` (F4) at display time, never inline here (keeps R6 of `provenance.md`'s "one formatter" true).
- **R3:** every comparison is symmetric and pairwise; there is no ranking or "authoritative source" concept anywhere in this function.
- **R6:** `buildEvidenceBase`'s only inputs are `evidence_feature` rows reached through `jurisdiction_dataset` mappings (F3) — it has no parameter through which an applicant file could enter.
- **R7:** `collectLimits` (in `run.ts`) reads each mapped dataset's recorded limitation (F3 R10, e.g. "canopy data can't show trunk diameters") and adds a `Limit` entry once per resource type affected — this doc doesn't invent limits; it surfaces what F3 already recorded.

## Verification

- Unit tests: `results.ts`'s ordering function (Impacts/Disagreements/Gaps sorted by a stable key) so R8's determinism holds regardless of query plan order; `collectLimits` mapping from dataset-recorded limitations to `Limit` entries.
- Testcontainers integration tests, with golden fixture geometries (hand-checked areas per the testing rules):
  - Two datasets mapped to one resource type with a hand-built disjoint pair of features produce the exact expected disagreement area in both directions (R3).
  - No dataset mapped → `no-dataset-mapped` gap; a mapped dataset whose `coverage` excludes the study area → `coverage-excludes-study-area` gap (R4).
  - Running `runAnalysis` twice with unchanged inputs inserts no second row (R8), and a **race test** firing two triggers for the same decision at once (e.g., a dataset refresh and a profile approval landing together) asserts the `decision:<id>` queue serializes them and the unique `(decision_id, purpose, input_sha256)` index prevents a duplicate result.
  - Determinism: the same fixture inputs run twice produce byte-identical `results` JSON.
