import { z } from "zod";

// TechDesign/provenance.md — the shape every figure UPlan shows carries. Nothing here is stored;
// every field is read from evidence/profiles/analysis rows and passed through these schemas.

export const ConfidenceLevelSchema = z.enum(["high", "moderate", "low"]);
export type ConfidenceLevel = z.infer<typeof ConfidenceLevelSchema>;

export const EvidenceProvenanceSchema = z
  .object({
    publisher: z.string().min(1),
    license: z.string().min(1),
    sourceUrl: z.url(),
    sourceAsOn: z.iso.date().nullable(), // dataset_version.source_as_of
    sourceAsOfNote: z.string().min(1).nullable(), // required when sourceAsOn is null (R2)
    retrievedAt: z.iso.datetime(), // dataset_version.retrieved_at, UTC
    confidence: ConfidenceLevelSchema,
    confidenceRationale: z.string().min(1),
    // evidence-layers.md R13: illustrative sample data (F23). Recorded on the dataset, never inferred.
    isSample: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.sourceAsOn === null && v.sourceAsOfNote === null) {
      ctx.addIssue({ code: "custom", message: "sourceAsOfNote is required when sourceAsOn is null" });
    }
  });
export type EvidenceProvenance = z.infer<typeof EvidenceProvenanceSchema>;

export const RuleProvenanceSchema = z.object({
  codeSection: z.string().min(1),
  ordinance: z.string().min(1).nullable(), // null: the code section is the only reference
  sourceUrl: z.url(),
  effectiveOn: z.iso.date(), // the date rulesInForce actually resolved for
});
export type RuleProvenance = z.infer<typeof RuleProvenanceSchema>;

export const DerivedProvenanceSchema = z
  .object({
    rules: z.array(RuleProvenanceSchema),
    evidence: z.array(EvidenceProvenanceSchema),
  })
  .refine((v) => v.rules.length + v.evidence.length > 0, {
    message: "a derived figure must cite at least one source",
  });
export type DerivedProvenance = z.infer<typeof DerivedProvenanceSchema>;

// evidence-review.md R1–R5: the facts behind an evidence item's confidence label. Plain data read from
// the dataset and its version; display goes through formatEvidenceAttributes. `verification` and
// `professionalReview` are single-value literals because release 1 has no field verification and no
// professional review (R4) — when that changes, the type changes and the compiler finds every use.
export const EvidenceAttributesSchema = z
  .object({
    authority: z.enum(["federal", "state", "regional", "county", "local"]),
    sourceAsOfOn: z.iso.date().nullable(),
    sourceAsOfNote: z.string().min(1).nullable(),
    retrievedAt: z.iso.datetime(), // never shown as the publisher's date (F4)
    spatialPrecision: z.enum(["site", "parcel", "regional", "coarse"]),
    verification: z.literal("mapped-remote"),
    professionalReview: z.literal("none"),
  })
  .superRefine((v, ctx) => {
    if (v.sourceAsOfOn === null && v.sourceAsOfNote === null) {
      ctx.addIssue({ code: "custom", message: "sourceAsOfNote is required when sourceAsOfOn is null" });
    }
  });
export type EvidenceAttributes = z.infer<typeof EvidenceAttributesSchema>;
