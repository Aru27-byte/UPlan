import { z } from "zod";

// TechDesign/research-changes.md — what finishing research pins into a `report` row, so the document is
// built only from records that can no longer change (F10 R17, F22 R11): the details as they were, each
// phase's adopted section content and the engine fingerprint it was built on, the resolutions that were
// shown, and what changed from the previous version. The renderer reads nothing "current".

// The phases, as literals here because `reports` can't import `workflow` (which imports `reports`).
// A unit test asserts this equals workflow's PHASES, so the two can't drift.
export const PHASE_KEYS = ["site", "evidence", "screening", "studies", "footprint", "impact"] as const;
export type PhaseKey = (typeof PHASE_KEYS)[number];

export const PhaseKeySchema = z.enum(PHASE_KEYS);

export const ReportDetailsSchema = z.object({
  title: z.string(),
  applicationType: z.enum(["subdivision", "short_subdivision", "clearing_grading"]),
  permitNumber: z.string().nullable(),
  parcelOrAddress: z.string().nullable(),
  applicant: z.string().nullable(),
  projectManager: z.string().nullable(),
  targetDecisionOn: z.iso.date().nullable(),
  applicationFiledOn: z.iso.date().nullable(),
  usesSampleData: z.boolean(), // F23: derived at finish from the pinned inputs
});
export type ReportDetails = z.infer<typeof ReportDetailsSchema>;

// The editable surface of a section (F21 R2): the narrative, plus a table's caption and column order. A
// column order is validated as a permutation of the canonical columns before it is stored; no value or
// provenance column lives here.
export const SectionTableFormatSchema = z.object({
  key: z.string(),
  caption: z.string().nullable(),
  columnOrder: z.array(z.string()),
});
export type SectionTableFormat = z.infer<typeof SectionTableFormatSchema>;

export const SectionContentSchema = z.object({
  headline: z.string(),
  lines: z.array(z.string()),
  tables: z.array(SectionTableFormatSchema),
});
export type SectionContent = z.infer<typeof SectionContentSchema>;
export type SectionContentInput = z.input<typeof SectionContentSchema>;

export const ReportSectionSchema = z.object({
  phase: PhaseKeySchema,
  sectionVersionNumber: z.number().int().positive().nullable(), // null when the analysis draft was used
  contentSha256: z.string(), // the section content the document prints
  outputSha256: z.string(), // the engine fingerprint it was built on
  headline: z.string(),
  lines: z.array(z.string()),
  tables: z.array(SectionTableFormatSchema),
  changed: z.boolean(), // differs from the previous version's content (always true for version 1)
});
export type ReportSection = z.infer<typeof ReportSectionSchema>;

export const ReportSnapshotSchema = z.object({
  templateVersion: z.number().int().positive(),
  details: ReportDetailsSchema,
  runId: z.uuid(),
  profileVersionId: z.uuid(),
  sections: z.array(ReportSectionSchema).length(PHASE_KEYS.length).optional().default([]),
  resolutions: z.array(
    z.object({
      resourceType: z.string(),
      mappedBy: z.string(),
      notMappedBy: z.string(),
      revision: z.number().int().positive(),
    }),
  ),
  previousVersion: z.number().int().positive().nullable(),
  detailsChanged: z.boolean(),
});
export type ReportSnapshot = z.infer<typeof ReportSnapshotSchema>;
