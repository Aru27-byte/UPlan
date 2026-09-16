import { z } from "zod";

// TechDesign/data-model.md ("The analysis results document"). Rounding happens only in the
// provenance module's display formatter — every value here is stored unrounded.
// R6 of impact-analysis.md: no field here expresses a judgment — measure, unit, range, and
// provenance-linking ids only.
//
// `analysis_run.results` is untyped jsonb (analysis/tables.ts: `.$type<unknown>()`), so every
// reader parses it through this schema rather than an `as`-cast (conventions.md: "no `as` casts on
// data from outside the process") — see render.ts's two call sites.

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

export const LimitSchema = z.object({
  key: z.enum(["significant-trees-not-countable", "boundary-set-by-site-study"]),
  resourceType: z.string().nullable(),
});
export type Limit = z.infer<typeof LimitSchema>;

export const AnalysisResultsSchema = z.object({
  impacts: z.array(ImpactSchema),
  evidenceBase: z.object({ disagreements: z.array(DisagreementSchema), gaps: z.array(GapSchema) }),
  limits: z.array(LimitSchema),
});
export type AnalysisResults = z.infer<typeof AnalysisResultsSchema>;

/**
 * R7/R8 (impact-analysis.md, evidence-base.md): a stable, content-derived sort so two runs
 * against identical pinned inputs always produce byte-identical results, regardless of the order
 * PostGIS returns rows in.
 */
// Plain code-unit comparison, not `localeCompare` — locale-aware collation depends on the
// runtime's default locale/ICU data, which byte-identical determinism (R7/R8) can't depend on.
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

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
    limits: [...results.limits].sort((a, b) =>
      compare(`${a.key}:${a.resourceType ?? ""}`, `${b.key}:${b.resourceType ?? ""}`),
    ),
  };
}
