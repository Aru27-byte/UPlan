import type {
  NextAction,
  PhaseKey,
  PhaseView,
  SectionContent,
  SectionState,
  SectionTableFormat,
  SectionVersion,
  StepKey,
  StepState,
  Workflow,
  LineDiff,
} from "@/modules/workflow";
import type { StepGroup } from "@/ui/phase/group-tones";
import type { PhaseViewModel } from "@/ui/phase/types";
import type { StatusTone } from "@/ui/status-label";

// Client-safe helpers for the workflow's states and links. Everything here is pure: client
// components import this file, so it must not reach server code (db, pg, node:crypto). Types are
// re-exported type-only and erased at compile time.

export type {
  NextAction,
  PhaseKey,
  PhaseView,
  SectionContent,
  SectionState,
  SectionTableFormat,
  SectionVersion,
  StepKey,
  StepState,
  Workflow,
  LineDiff,
};

export const PHASE_TITLE: Record<PhaseKey, string> = {
  site: "Site",
  evidence: "Evidence",
  screening: "Screening",
  studies: "Studies",
  footprint: "Footprint",
  impact: "Impact",
};

export const STEP_TITLE = { overview: "Overview", ...PHASE_TITLE, report: "Report" } as const;

export const STEP_GROUP: Record<keyof typeof STEP_TITLE, StepGroup> = {
  overview: "Set up",
  site: "Set up",
  evidence: "Assemble",
  screening: "Analyze",
  studies: "Analyze",
  footprint: "Analyze",
  impact: "Analyze",
  report: "Report",
};

/** The number of the latest published version, for a page that only shows it once one exists. */
export function publishedVersion(latestVersion: number | null): number {
  if (latestVersion === null) throw new Error("a completed project has no published version");
  return latestVersion;
}

export function projectHref(projectId: string, step: keyof typeof STEP_TITLE): string {
  return `/projects/${projectId}/${step}`;
}

export type Labelled = { text: string; tone: StatusTone };

/** The text and tone for a section's state (research-phases.md R5). */
export function sectionStateLabel(state: PhaseView["state"]): Labelled & { kind: PhaseViewModel["state"]["kind"] } {
  switch (state.kind) {
    case "to-do":
      return { kind: "to-do", text: "To do", tone: "neutral" };
    case "updating":
      // A failed or blocked analysis is not "updating": it needs the planner's eye (F18 R2).
      return state.status.kind === "failed" || state.status.kind === "blocked"
        ? { kind: "updating", text: "Needs attention", tone: "danger" }
        : { kind: "updating", text: "Updating", tone: "info" };
    case "ready":
      return { kind: "ready", text: "Ready", tone: "ok" };
    case "out-of-date":
      return { kind: "out-of-date", text: "Out of date", tone: "warn" };
  }
}
