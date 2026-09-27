import type { ReportDetails, ReportSnapshot } from "@/modules/reports";

import type { PhaseKey, PhaseView } from "./phases";

// TechDesign/research-changes.md, "What changed" (F22 R5). Pure: compares the current phase outputs and
// project details with the last published version's snapshot, by fingerprint.

export type ChangeSummary = {
  baseVersion: number;
  phases: { phase: PhaseKey; changed: boolean; reviewedAtCurrentOutput: boolean }[];
  detailsChanged: boolean;
  hasChanges: boolean; // any phase changed, or the details changed
};

const DETAIL_KEYS = [
  "title",
  "applicationType",
  "permitNumber",
  "parcelOrAddress",
  "applicant",
  "projectManager",
  "targetDecisionOn",
  "applicationFiledOn",
  "usesSampleData",
] as const satisfies readonly (keyof ReportDetails)[];

export function detailsDiffer(a: ReportDetails, b: ReportDetails): boolean {
  return DETAIL_KEYS.some((key) => a[key] !== b[key]);
}

/**
 * A phase is `changed` when its output is absent (it is being recomputed) or its fingerprint differs
 * from the one stored in the base version. A phase whose output is unchanged keeps its review and needs
 * none (R5). Details are compared field by field.
 */
export function summarizeChanges(
  views: PhaseView[],
  base: { versionNumber: number; snapshot: ReportSnapshot },
  currentDetails: ReportDetails,
): ChangeSummary {
  const phases = views.map((view) => {
    const before = base.snapshot.phases.find((p) => p.phase === view.phase);
    return {
      phase: view.phase,
      changed: !view.output || view.output.contentSha256 !== before?.contentSha256,
      reviewedAtCurrentOutput: view.state.kind === "reviewed",
    };
  });
  const detailsChanged = detailsDiffer(base.snapshot.details, currentDetails);
  return {
    baseVersion: base.versionNumber,
    phases,
    detailsChanged,
    hasChanges: detailsChanged || phases.some((p) => p.changed),
  };
}
