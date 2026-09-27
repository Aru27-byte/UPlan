import { z } from "zod";

// TechDesign/research-changes.md — what finishing research pins into a `report` row, so the document is
// built only from records that can no longer change (F10 R17, F22 R11): the details as they were, each
// phase's review and the drafted summary that was reviewed, the resolutions that were shown, and what
// changed from the previous version. The renderer reads nothing "current".

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

export const ReportPhaseSchema = z.object({
  phase: PhaseKeySchema,
  contentSha256: z.string(),
  verdict: z.literal("reviewed"), // finishing requires every phase reviewed at its current output (F22 R1)
  note: z.string().nullable(),
  reviewedAt: z.iso.datetime(),
  reviewedByName: z.string(), // copied, so a later change to a person's name can't change a published record
  changed: z.boolean(), // differs from the previous version's fingerprint (always true for version 1)
  summary: z.object({
    templateVersion: z.number().int().positive(),
    headline: z.string(),
    lines: z.array(z.string()),
  }),
});
export type ReportPhase = z.infer<typeof ReportPhaseSchema>;

export const ReportSnapshotSchema = z.object({
  templateVersion: z.number().int().positive(),
  details: ReportDetailsSchema,
  runId: z.uuid(),
  profileVersionId: z.uuid(),
  phases: z.array(ReportPhaseSchema).length(PHASE_KEYS.length),
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
