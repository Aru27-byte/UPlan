import type { ReportDetails, ReportSnapshot } from "@/modules/reports";

import type { PhaseKey } from "./phases";
import { contentSha256, draftContent, type PhaseView } from "./sections";

// TechDesign/research-changes.md, "What changed" (F22 R5). Pure: compares the current sections and project
// details with the last published version's snapshot, by content hash.

export type ChangeSummary = {
  baseVersion: number;
  phases: { phase: PhaseKey; changed: boolean; ready: boolean }[];
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

/** The content hash of what the phase currently shows: its stored version, or its analysis draft. */
function currentContentSha(view: PhaseView): string | null {
  if (view.state.kind === "ready") return contentSha256(view.state.content);
  if (view.versions[0]) return view.versions[0].contentSha256;
  if (view.output) return contentSha256(draftContent(view.output));
  return null;
}

/**
 * A phase is `changed` when the content hash it shows differs from the one stored in the base snapshot (or
 * there is no current section). A phase whose section is unchanged keeps its version and needs no edit (R5).
 * Details are compared field by field.
 */
export function summarizeChanges(
  views: PhaseView[],
  base: ReportSnapshot,
  baseVersion: number,
  currentDetails: ReportDetails,
): ChangeSummary {
  const phases = views.map((view) => {
    const before = base.sections.find((s) => s.phase === view.phase);
    return {
      phase: view.phase,
      changed: currentContentSha(view) !== (before?.contentSha256 ?? null),
      ready: view.state.kind === "ready",
    };
  });
  const detailsChanged = detailsDiffer(base.details, currentDetails);
  return {
    baseVersion,
    phases,
    detailsChanged,
    hasChanges: detailsChanged || phases.some((p) => p.changed),
  };
}
