import { z } from "zod";

// TechDesign/data-model.md ("The analysis results document"). Rounding happens only in the
// provenance module's display formatter — every value here is stored unrounded.
// R6 of impact-analysis.md: no field here expresses a judgment — measure, unit, range, and
// provenance-linking ids only. That includes the screening register and the study flags (F14 R10):
// no type below has a free-text field, a severity, a score, or a rank, so a verdict has nowhere to live.
//
// `analysis_run.results` is untyped jsonb (analysis/tables.ts: `.$type<unknown>()`), so every
// reader parses it through this schema rather than an `as`-cast (conventions.md: "no `as` casts on
// data from outside the process").

/**
 * The shape of `results` (study-scoping.md): 1 = impacts, evidenceBase, limits; 2 = adds screening and
 * studyFlags and gives dataset limitations their own key. Part of the input hash, so a change here
 * makes every open decision recompute once. A run at another version is reported as out of date and
 * never parsed as best it can.
 */
export const RESULTS_VERSION = 2;

export const ImpactSchema = z.object({
  impactKey: z.string(), // `${resourceType}:${datasetKey}:${sourceFeatureId}:${measure}`
  resourceType: z.string(),
  measure: z.enum(["feature-area-in-footprint", "feature-length-in-footprint", "buffer-area-in-footprint"]),
  unit: z.enum(["us-survey-sq-ft", "us-survey-ft"]),
  min: z.number(),
  max: z.number(), // equals min unless a rule depends on an attribute the evidence lacks (R3 of impact-analysis.md)
  dependsOn: z.string().nullable(),
  approximate: z.boolean(),
  ruleKeys: z.array(z.string()),
  evidence: z.array(z.object({ datasetVersionId: z.string(), sourceFeatureId: z.string() })),
});
export type Impact = z.infer<typeof ImpactSchema>;

export const DisagreementSchema = z.object({
  resourceType: z.string(),
  mappedBy: z.string(), // dataset version id
  notMappedBy: z.string(), // dataset version id
  area: z.number(),
  unit: z.literal("us-survey-sq-ft"),
});
export type Disagreement = z.infer<typeof DisagreementSchema>;

export const GapSchema = z.object({
  resourceType: z.string(),
  reason: z.enum(["no-dataset-mapped", "coverage-excludes-study-area"]),
});
export type Gap = z.infer<typeof GapSchema>;

// What desk analysis can't see. Keyed facts, never generated text (limit-text.ts words them):
//  - significant-trees-not-countable: canopy data shows extent, not trunk diameters (charter, Known limits)
//  - boundary-set-by-site-study: a resource type the profile marks approximate (charter; F1 mapStatus)
//  - dataset-limitation: what a dataset's own recorded limitation says it can't show (F3 R10), by version
export const LimitSchema = z.object({
  key: z.enum(["significant-trees-not-countable", "boundary-set-by-site-study", "dataset-limitation"]),
  resourceType: z.string().nullable(),
  datasetVersionId: z.string().nullable(),
});
export type Limit = z.infer<typeof LimitSchema>;

// F14 R1–R4, R7, R8: one row per resource type and mapped dataset whose coverage reaches the study area.
export const ScreeningRowSchema = z.object({
  resourceType: z.string(),
  datasetVersionId: z.string(),
  intersectingFeatureCount: z.number().int(), // a measured zero is a real zero (R1)
  overlapAreaSqFt: z.number(), // polygon features clipped to the study area
  overlapLengthFt: z.number(), // line features clipped to the study area
  searchedWithinFt: z.number(), // R3: the widest buffer or trigger distance for this resource type
  nearestDistanceFt: z.number().nullable(), // null: nothing mapped within searchedWithinFt
  bufferReaches: z.array(
    z.object({
      ruleKey: z.string(),
      applicability: z.enum(["yes", "unknown"]), // "no" is dropped; "unknown" is R4's range rule
      featureCount: z.number().int(), // features off the site whose buffer reaches onto it
    }),
  ),
  approximate: z.boolean(), // R8
});
export type ScreeningRow = z.infer<typeof ScreeningRowSchema>;

export const StudyNameSchema = z.enum(["critical-area-study", "geotechnical-report", "arborist-report"]);
export type StudyName = z.infer<typeof StudyNameSchema>;

// F14 R5: a trigger whose distance condition is met by mapped data. A flag can add a study; the
// absence of a flag never removes one (R6).
export const StudyFlagSchema = z.object({
  triggerKey: z.string(),
  study: StudyNameSchema,
  resourceType: z.string(),
  nearestDistanceFt: z.number(), // 0 when a mapped feature intersects the study area
  approximate: z.boolean(),
  ruleKeys: z.array(z.string()), // [triggerKey]; resolves to the rule's citation and dates
  evidence: z.array(z.object({ datasetVersionId: z.string(), sourceFeatureId: z.string() })),
});
export type StudyFlag = z.infer<typeof StudyFlagSchema>;

export const AnalysisResultsSchema = z.object({
  impacts: z.array(ImpactSchema),
  evidenceBase: z.object({ disagreements: z.array(DisagreementSchema), gaps: z.array(GapSchema) }),
  screening: z.array(ScreeningRowSchema),
  studyFlags: z.array(StudyFlagSchema),
  limits: z.array(LimitSchema),
});
export type AnalysisResults = z.infer<typeof AnalysisResultsSchema>;

// Plain code-unit comparison, not `localeCompare` — locale-aware collation depends on the
// runtime's default locale/ICU data, which byte-identical determinism (R7/R8) can't depend on.
export function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * F14 R10: a fixed display order — largest measured polygon overlap first, then largest line overlap,
 * then nearest distance (nothing mapped within reach last), then resource type and dataset version. It
 * is a convenience for reading, and carries no rank, priority, or severity.
 */
export function sortScreening(rows: ScreeningRow[]): ScreeningRow[] {
  return [...rows].sort((a, b) => {
    if (a.overlapAreaSqFt !== b.overlapAreaSqFt) return b.overlapAreaSqFt - a.overlapAreaSqFt;
    if (a.overlapLengthFt !== b.overlapLengthFt) return b.overlapLengthFt - a.overlapLengthFt;
    if (a.nearestDistanceFt !== b.nearestDistanceFt) {
      if (a.nearestDistanceFt === null) return 1;
      if (b.nearestDistanceFt === null) return -1;
      return a.nearestDistanceFt - b.nearestDistanceFt;
    }
    return compare(`${a.resourceType}:${a.datasetVersionId}`, `${b.resourceType}:${b.datasetVersionId}`);
  });
}

/**
 * R7/R8 (impact-analysis.md, evidence-base.md): a stable, content-derived sort so two runs
 * against identical pinned inputs always produce byte-identical results, regardless of the order
 * PostGIS returns rows in.
 */
export function orderResults(results: AnalysisResults): AnalysisResults {
  return {
    impacts: [...results.impacts].sort((a, b) => compare(a.impactKey, b.impactKey)),
    evidenceBase: {
      disagreements: [...results.evidenceBase.disagreements].sort((a, b) =>
        compare(
          `${a.resourceType}:${a.mappedBy}:${a.notMappedBy}`,
          `${b.resourceType}:${b.mappedBy}:${b.notMappedBy}`,
        ),
      ),
      gaps: [...results.evidenceBase.gaps].sort((a, b) =>
        compare(`${a.resourceType}:${a.reason}`, `${b.resourceType}:${b.reason}`),
      ),
    },
    screening: sortScreening(results.screening),
    studyFlags: [...results.studyFlags].sort((a, b) => compare(a.triggerKey, b.triggerKey)),
    limits: [...results.limits].sort((a, b) =>
      compare(
        `${a.key}:${a.resourceType ?? ""}:${a.datasetVersionId ?? ""}`,
        `${b.key}:${b.resourceType ?? ""}:${b.datasetVersionId ?? ""}`,
      ),
    ),
  };
}
