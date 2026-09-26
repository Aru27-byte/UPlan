# TechDesign — Study Scoping

**Feature:** F14 · `analysis`
**Status:** Draft
**Requirements:** [Requirements/study-scoping.md](../Requirements/study-scoping.md) (R1–R14)
**Builds on:** [evidence-base.md](evidence-base.md) (F7 — `runAnalysis`, pinning, `results.ts`), [impact-analysis.md](impact-analysis.md) (F9 — the range rule and `evaluateAppliesWhen`), [system-architecture.md](system-architecture.md) (_Impact engine_), [data-model.md](data-model.md) (`analysis_run`)
**Release:** 1

## Approach

Screening and study flags are two more sections of the same `AnalysisResults`, computed by the same `run_analysis` job from the same pinned inputs. They need a study area and nothing else, so they exist for every decision that has one. The register and the flags are not a separate run, because a separate run would need its own pinning, its own idempotency key, and a second place for the numbers to disagree with the first.

**Rejected:** the earlier plan of a new `analysis_run.purpose = 'scoping'` for "a run with no footprint". A run with `footprint_revision = null` already is that run (F7), so the purpose value would add a state without adding a difference. The line under _Additions later in v1_ in `data-model.md` now says so instead.

## Module

```
src/modules/analysis/
  screening.ts         computeScreening, computeStudyFlags — this feature
  screening-text.ts    describeScreeningRow: the fixed sentence templates (R13)
  results.ts           gains ScreeningRow, StudyFlag, RESULTS_VERSION
```

`run.ts` calls both new functions beside `buildEvidenceBase`, with the study area geometry.

## Data model

```ts
// results.ts — additions to AnalysisResults (data-model.md carries the full shape)
export type AnalysisResults = {
  impacts: Impact[];
  evidenceBase: { disagreements: Disagreement[]; gaps: Gap[] };
  screening: ScreeningRow[];
  studyFlags: StudyFlag[];
  limits: Limit[];
};

export type ScreeningRow = {
  resourceType: string;
  datasetVersionId: string;
  intersectingFeatureCount: number; // a measured zero is a real zero (R1)
  overlapAreaSqFt: number; // polygon features clipped to the study area
  overlapLengthFt: number; // line features clipped to the study area
  searchedWithinFt: number; // R3: the widest buffer or trigger distance for this resource type
  nearestDistanceFt: number | null; // null: nothing mapped within searchedWithinFt
  bufferReaches: { ruleKey: string; applicability: "yes" | "unknown"; featureCount: number }[]; // R2, R4
  approximate: boolean; // R8
};

export type StudyFlag = {
  triggerKey: string;
  study: "critical-area-study" | "geotechnical-report" | "arborist-report";
  resourceType: string;
  nearestDistanceFt: number; // 0 when a mapped feature intersects the study area
  approximate: boolean;
  ruleKeys: string[]; // [triggerKey]; resolves to the rule's citation and dates (R5)
  evidence: { datasetVersionId: string; sourceFeatureId: string }[];
};
```

Like `Impact`, neither type has a free-text field, a severity, or a score, so a verdict has nowhere to live (R10, R13).

### Versioning the results document

`analysis_run` gains `results_version integer not null`. The migration adds it with `default 1` and then drops the default. PostgreSQL fills the existing rows without an `UPDATE`, so the `analysis_run_final` trigger is not involved, and no column keeps a default that stands in for missing information.

```ts
export const RESULTS_VERSION = 2; // 1: impacts, evidenceBase, limits · 2: adds screening, studyFlags
```

- `getRun` and `getLatestRun` parse by `results_version`. A run whose version isn't `RESULTS_VERSION` returns a typed `outOfDate` result that pages show as "This run predates study scoping and is being replaced". Nothing parses an old document "as best it can", and nothing fills the missing sections with empty arrays.
- `results_version` is part of the `input_sha256` payload. Without it, an open decision's inputs would hash the same as its version-1 run, and F7 R8's "identical inputs are a no-op" rule would skip the recompute.
- J3 (`apply_effective_dates`, daily per city) also enqueues `run_analysis` for each open decision whose latest `current` run has an outdated `results_version`, on that decision's own queue with an explicit `max_attempts`. A migration can't enqueue these itself, because the graphile-worker schema doesn't exist on a fresh database until the worker first starts. Released reports are PDFs and are unaffected.

## Screening (R1, R2, R3, R4, R7, R11)

```ts
// screening.ts
export async function computeScreening(
  rules: InForceRules,
  mappings: JurisdictionDatasetMapping[],
  studyAreaGeom: Geometry,
  srid: number,
): Promise<ScreeningRow[]> {
  const rows: ScreeningRow[] = [];
  for (const resourceType of rules.resourceTypes) {
    const searchedWithinFt = Math.max(
      0,
      ...rules.bufferRules.filter((b) => b.resourceType === resourceType.key).map((b) => b.widthFt),
      ...rules.studyTriggers.filter((t) => t.resourceType === resourceType.key).map((t) => t.withinFt),
    );
    for (const m of mappings.filter((x) => x.resourceTypeKey === resourceType.key)) {
      // R7: a mapped dataset whose coverage excludes the study area is F7's gap, not a row of zeros.
      if (!intersectsCoverage(m.dataset.coverage, studyAreaGeom)) continue;
      const [measured] = await sql`
        select
          count(*) filter (where ST_Intersects(geom, ${studyAreaGeom})) as intersecting,
          coalesce(sum(ST_Area(ST_Transform(ST_Intersection(geom, ${studyAreaGeom}), ${srid})))
            filter (where ST_Intersects(geom, ${studyAreaGeom}) and ST_Dimension(geom) = 2), 0) as area_sq_ft,
          coalesce(sum(ST_Length(ST_Transform(ST_Intersection(geom, ${studyAreaGeom}), ${srid})))
            filter (where ST_Intersects(geom, ${studyAreaGeom}) and ST_Dimension(geom) = 1), 0) as length_ft,
          min(ST_Distance(ST_Transform(geom, ${srid}), ST_Transform(${studyAreaGeom}, ${srid})))
            filter (where ST_DWithin(ST_Transform(geom, ${srid}), ST_Transform(${studyAreaGeom}, ${srid}), ${searchedWithinFt})) as nearest_ft
        from evidence_feature
        where dataset_version_id = ${m.dataset.currentVersionId}`; // R13: PostGIS only
      rows.push({
        resourceType: resourceType.key,
        datasetVersionId: m.dataset.currentVersionId,
        intersectingFeatureCount: measured.intersecting,
        overlapAreaSqFt: measured.area_sq_ft,
        overlapLengthFt: measured.length_ft,
        searchedWithinFt,
        nearestDistanceFt: measured.nearest_ft, // null when the filtered min has no rows (R3)
        bufferReaches: await computeBufferReaches(rules, resourceType.key, m, studyAreaGeom, srid),
        approximate: resourceType.mapStatus === "approximate",
      });
    }
  }
  return sortScreening(rows); // R10, R13
}
```

- **R3:** `nearest_ft` is a `min` over a `filter (where ST_DWithin …)`, so a dataset with nothing inside `searchedWithinFt` yields SQL `null`, which the type carries as `null`. The sentence template turns `null` into "none mapped within N ft". There is no `?? 0` and no "infinite" stand-in.
- **R2, R4:** `computeBufferReaches` runs F9's buffer query shape against the study area (`ST_DWithin` in the analysis SRID) and reuses `evaluateAppliesWhen`. An applicability of `"no"` is dropped, `"yes"` and `"unknown"` are kept per rule key with their feature counts. It doesn't duplicate that function, so the range rule stays in one place.
- **R7:** the `continue` is deliberate. The gap is already in `evidenceBase.gaps` (F7), and the register joins the two at display time, so the fact is stated once.
- **R11:** the function takes the study area geometry only. Nothing here reads a footprint.
- `sortScreening` orders by `overlapAreaSqFt + overlapLengthFt` descending, then `nearestDistanceFt` ascending with `null` last, then `resourceType`, then dataset key. It is a display order and carries no rank field (R10).

## Study flags (R5, R6)

```ts
export async function computeStudyFlags(
  rules: InForceRules,
  mappings: JurisdictionDatasetMapping[],
  studyAreaGeom: Geometry,
  srid: number,
): Promise<StudyFlag[]> {
  const flags: StudyFlag[] = [];
  for (const trigger of rules.studyTriggers) {
    const resourceType = rules.resourceTypes.find((r) => r.key === trigger.resourceType);
    if (!resourceType) throw new ValidationError(`trigger ${trigger.key} names an unknown resource type`); // the profile schema already rejects this; this guard states the invariant
    const evidence: StudyFlag["evidence"] = [];
    let nearest: number | null = null;
    for (const m of mappings.filter((x) => x.resourceTypeKey === trigger.resourceType)) {
      const rows = await sql`
        select source_feature_id,
          ST_Distance(ST_Transform(geom, ${srid}), ST_Transform(${studyAreaGeom}, ${srid})) as distance_ft
        from evidence_feature
        where dataset_version_id = ${m.dataset.currentVersionId}
          and ST_DWithin(ST_Transform(geom, ${srid}), ST_Transform(${studyAreaGeom}, ${srid}), ${trigger.withinFt})
        order by source_feature_id`;
      for (const r of rows) {
        evidence.push({ datasetVersionId: m.dataset.currentVersionId, sourceFeatureId: r.source_feature_id });
        nearest = nearest === null ? r.distance_ft : Math.min(nearest, r.distance_ft);
      }
    }
    if (evidence.length === 0 || nearest === null) continue; // R6: no flag is a fact about mapped data, never a waiver
    flags.push({
      triggerKey: trigger.key,
      study: trigger.study,
      resourceType: trigger.resourceType,
      nearestDistanceFt: nearest,
      approximate: resourceType.mapStatus === "approximate",
      ruleKeys: [trigger.key],
      evidence,
    });
  }
  return flags.sort((a, b) => a.triggerKey.localeCompare(b.triggerKey));
}
```

The comparison `Math.min` picks between two PostGIS-computed distances. It does no geometry arithmetic in JavaScript (R13, and the "no area, length, or buffer in JavaScript" rule).

The Studies page doesn't read absence from `studyFlags`. It lists the studies named by `rules.studyTriggers`, marks each one flagged or "not flagged by mapped data", and prints the fixed P2 sentence beside every unflagged one (R6). No code path yields "waived", "not required", or "clear".

## Interfaces

Two routes under `src/app/(app)/decisions/[decisionId]/`, both plain Server Components with no client JavaScript:

- **`screening/page.tsx`** — the register. Columns: Resource · Finding · Evidence · Confidence · Flag. `describeScreeningRow(row, provenance)` returns the finding sentence from a fixed template, for example "Mapped in the study area: 3 features, 4,210 sq ft" or "None mapped within 300 ft". Numbers pass through `provenance`'s display formatter, so no page rounds anything. A gap from `evidenceBase.gaps` renders as its own row. Each row links to `/decisions/[id]/map?layer=<resourceType>` (R14) and carries the row's formatted provenance (F4).
- **`studies/page.tsx`** — the flags and the data gaps. One block per study named in the profile, each flag with its rule's code section, effective date, and the nearest distance; then the data-gaps list (R12): F7's gaps, each pinned dataset with no publisher date (read from the run's `analysis_run_dataset` rows and F3's provenance), and each `Limit`. Both pages open with the R9 statement.

Both pages call one function, `getLatestRun(decisionId, "current")`, and show the "predates study scoping" state for an out-of-date run. `analysis`'s `index.ts` exports `describeScreeningRow`.

## Requirement coverage

| Req | Satisfied by | Notes |
| --- | --- | --- |
| R1 | `computeScreening`, `ScreeningRow` counts and overlap fields | A measured zero is stored as `0` |
| R2 | `computeBufferReaches` | Reuses `evaluateAppliesWhen` |
| R3 | `searchedWithinFt` plus the filtered `min` returning `null` | Sentence: "none mapped within N ft" |
| R4 | `applicability: "unknown"` in `bufferReaches` | Same range rule as F9 R3 |
| R5 | `computeStudyFlags`, `StudyFlag` | Provenance via `ruleKeys` and `evidence` |
| R6 | Studies page lists every study in the profile; no flag never removes | P2 sentence beside each unflagged study |
| R7 | The screening `continue` and the joined `evidenceBase.gaps` rows | Gap shown once, joined at display |
| R8 | `approximate` on the row and flag, and the fixed sentence | From F1's `mapStatus` |
| R9 | Both pages open with the statement; `limits` rendered | Text is a fixed template |
| R10 | `sortScreening`; no rank or severity field on any type | Type shape is the guard |
| R11 | `computeScreening` takes only the study area | `footprint_revision` stays nullable |
| R12 | Studies page data-gaps list | Facts only |
| R13 | PostGIS-only SQL, `sortScreening`, `RESULTS_VERSION` in the input hash, fixed templates | Determinism tested byte for byte |
| R14 | `?layer=` link | The receiving side is F6 R8 |

## Risks and tradeoffs

- **Results version bump.** Every open decision recomputes once after the migration. Mitigation: it is the ordinary `run_analysis` job on each decision's own queue, and released reports are untouched.
- **Search distance can hide a feature.** A resource whose nearest feature is beyond `searchedWithinFt` shows "none mapped within N ft". That is honest but easy to misread, which is why the distance is shown in the sentence itself and R9's statement opens both pages.
- **A trigger with `withinFt = 0`** flags only intersection. That follows the profile, not a default.
- **The register's usefulness depends on the profile's buffers and triggers.** A city with none gets rows of measured overlap and no flags. It is not an error.

## Verification

- Testcontainers integration tests with hand-checked golden geometries (per the testing rules):
  - A polygon fully inside the study area yields its exact area, and `nearestDistanceFt` of 0 (R1, R3).
  - A line clipped by the study area yields its exact length in `overlapLengthFt` (R1).
  - A feature outside the study area whose 100 ft buffer reaches onto it appears in `bufferReaches` with `"yes"`, and one with the `appliesWhen` attribute missing appears as `"unknown"` (R2, R4).
  - Nothing mapped within `searchedWithinFt` gives `nearestDistanceFt = null` and the exact template sentence (R3).
  - A trigger met by a feature yields one flag with the exact distance and evidence ids, and a trigger not met yields none (R5, R6).
  - A dataset whose coverage excludes the study area yields a gap and no screening row (R7).
- A failure test that a run whose `results_version` isn't current is returned as `outOfDate`, not parsed, and that the input hash differs between versions 1 and 2 (R13).
- A determinism test runs the same fixture twice and asserts byte-identical `screening` and `studyFlags` (R13).
- A unit test enumerates every field of `ScreeningRow` and `StudyFlag` and asserts none is free text, and a denylist test over `describeScreeningRow`'s output for "clear", "safe", "no study needed", "waived", "significant" (P2, R6, R9).
- Playwright: the Screening and Studies pages pass `@axe-core/playwright` at desktop and phone widths, and a study with no flag shows the P2 sentence (R6).

## Open questions

- Whether a city can set a data-age threshold in its profile settings (see the Requirements' _Open items_). It would add a setting to `ProfileDocument`, so it needs its own round.
- Waiting up to a day for J3 leaves open decisions on the "predates study scoping" state after a deploy. The likely fix is one line in `deploy/deploy.sh` that adds a J3 job for each city once the worker is up. `deployment-guide.md` needs that step if it is adopted.
