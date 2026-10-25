import { contentSha256, sectionDiff } from "@/modules/workflow";
import type { NextAction, PhaseView, SectionContent, StepState, Workflow } from "@/modules/workflow";
import { formatTimestamp } from "@/modules/provenance";
import type { AnalysisStatus, InputChange } from "@/modules/analysis";
import type { Action, PhaseViewModel, ReportSectionModel, SectionVersionModel } from "@/ui/phase/types";
import type { StatusTone } from "@/ui/status-label";

import {
  PHASE_TITLE,
  STEP_GROUP,
  STEP_TITLE,
  projectHref,
  publishedVersion,
  sectionStateLabel,
  type Labelled,
} from "./workflow-client";

export {
  PHASE_TITLE,
  STEP_GROUP,
  STEP_TITLE,
  projectHref,
  publishedVersion,
  sectionStateLabel,
};
export type { Labelled };

// App-layer glue: the words the pages use for the workflow's states, in one place, so the rail, the
// Overview, the dashboard, and every phase page say the same thing. Every label states a state and none
// states a verdict: nothing here says done, complete, clear, safe, or approved (F18 R2, P2). A section is
// To do, Updating, Ready, or Out of date (research-phases.md R5); there is no review verdict.

export function stepLabel(step: StepState): Labelled {
  if (step.step === "overview") {
    return step.state === "needs-attention" ? { text: "Needs attention", tone: "danger" } : { text: "Recorded", tone: "neutral" };
  }
  if (step.step === "report") {
    switch (step.state) {
      case "not-ready":
        return { text: "Not ready", tone: "neutral" };
      case "ready":
        return { text: "Ready to finish", tone: "info" };
      case "generating":
        return { text: "Generating", tone: "info" };
      case "published":
        return { text: step.latestVersion === null ? "Published" : `Version ${step.latestVersion} published`, tone: "info" };
    }
  }
  return sectionStateLabel(step.state);
}

/** The plain words for an analysis status (F18 R7). */
export function analysisStatusText(status: AnalysisStatus): { text: string; tone: StatusTone; detail: string } {
  switch (status.kind) {
    case "none":
      return status.reason === "no-study-area"
        ? { text: "Nothing to analyze yet", tone: "neutral", detail: "Add a study area on the Site page and UPlan starts the analysis." }
        : { text: "No city profile", tone: "warn", detail: "This city has no approved profile yet, so there are no rules to analyze against." };
    case "current":
      return { text: "Analysis is current", tone: "ok", detail: "It was run on exactly the inputs the project holds now." };
    case "running":
      return { text: "Analysis is running", tone: "info", detail: "The background worker is computing it. This page updates when it finishes." };
    case "failed":
      return { text: "Analysis failed", tone: "danger", detail: status.errorDetail };
    case "blocked":
      return { text: "Analysis is waiting on a detail", tone: "warn", detail: status.reason };
    case "out-of-date":
      return {
        text: "Analysis is out of date",
        tone: "warn",
        detail:
          status.changes.length === 0
            ? "It hasn't run on the current inputs yet. If this doesn't change within a minute, the background worker may not be running (see LOCAL_HOSTING.md)."
            : `Since the last run: ${status.changes.map(describeChange).join("; ")}.`,
      };
  }
}

function describeChange(change: InputChange): string {
  switch (change.kind) {
    case "study-area":
      return `the study area changed (revision ${change.from ?? "none"} to ${change.to})`;
    case "footprint":
      return change.from === null ? `a footprint was added (revision ${change.to})` : `the footprint changed (revision ${change.from} to ${change.to})`;
    case "profile-version":
      return "the city profile changed";
    case "rules-in-force":
      return "a rule took effect or was repealed";
    case "dataset-version":
      return `the ${change.datasetKey} dataset was updated`;
    case "results-version":
      return "the analysis engine's output shape changed";
  }
}

/** One fixed sentence per next-action key (F18 R6): a step to take, never a judgment about the development. */
export const NEXT_ACTION_TEXT: Record<NextAction["key"], string> = {
  "finish-generating": "The document is being generated. This page updates when it finishes.",
  "draw-study-area": "Add the study area: draw it, upload a boundary, or load the sample.",
  "record-filing-date": "Record the application's filing date in the project details.",
  "review-failed-analysis": "The analysis failed. Read its error, then change an input or ask UPlan staff.",
  "wait-for-analysis": "Wait for the analysis to finish.",
  "update-section": "Bring the section up to date with the current analysis.",
  "resolve-disagreements": "Record which source you rely on where two sources disagree.",
  "trace-footprint": "Add the proposal's footprint: trace it, upload a boundary, or load the sample.",
  "finish-research": "Every phase is ready. Finish research to publish the final document.",
  "start-research-change": "This project is completed. Start a research change to update it.",
};

const dateOf = (instant: Date, timeZone: string) => formatTimestamp(instant, timeZone);

const EMPTY_REASON = {
  "no-study-area": "This phase needs a study area. Add one on the Site page.",
  "no-footprint": "This phase needs a footprint. Add one on the Footprint page.",
} as const satisfies Record<Extract<PhaseView["state"], { kind: "to-do" }>["reason"], string>;

/** What the page shows: the Ready content, or the newest stored version when the analysis has moved past it. */
export function shownSectionContent(state: PhaseView["state"]): SectionContent | null {
  switch (state.kind) {
    case "ready":
      return state.content;
    case "out-of-date":
      return state.version.content;
    case "to-do":
    case "updating":
      return state.version?.content ?? null;
  }
}

/** Builds the plain shape a phase page renders from workflow's PhaseView, formatting every date here. */
export function toPhaseViewModel(
  view: PhaseView,
  workflow: Workflow,
  changeLinks: PhaseViewModel["changeLinks"],
  inputs: PhaseViewModel["inputs"],
): PhaseViewModel {
  const label = sectionStateLabel(view.state);
  const readOnly = workflow.decisionStatus !== "in_progress";
  const analysis = analysisStatusText(workflow.facts.status);

  let emptyReason: string | null = null;
  if (!view.output) {
    emptyReason = view.state.kind === "to-do" ? EMPTY_REASON[view.state.reason] : `${analysis.text}. ${analysis.detail}`;
  }

  return {
    phase: view.phase,
    title: PHASE_TITLE[view.phase],
    group: STEP_GROUP[view.phase],
    state: { kind: label.kind, text: label.text, tone: label.tone },
    emptyReason,
    inputs: inputs.length > 0 ? inputs : (view.output?.inputs ?? []),
    changeLinks,
    readOnly,
    readOnlyReason: readOnlyReasonOf(workflow),
  };
}

function readOnlyReasonOf(workflow: Workflow): string | null {
  if (workflow.decisionStatus === "in_progress") return null;
  return workflow.decisionStatus === "finishing"
    ? "A document is being generated for this project, so nothing can change until it finishes."
    : `Version ${publishedVersion(workflow.latestVersion)} is published. Start a research change on the Overview to edit this phase.`;
}

function versionSourceText(version: PhaseView["versions"][number]): string {
  switch (version.source) {
    case "analysis":
      return "From the analysis";
    case "ai":
      return "Changed with UPlan Assist";
    case "revert":
      return version.sourceVersionNumber === null ? "Revert" : `Revert of version ${version.sourceVersionNumber}`;
  }
}

/** The section panel's model: the shown content's hashes, the history, and the actions the page offers. */
export function toReportSectionModel(
  view: PhaseView | null,
  workflow: Workflow,
  step: keyof typeof STEP_TITLE,
  actions: { revertAction?: Action; updateAction?: Action } = {},
): ReportSectionModel {
  const readOnly = workflow.decisionStatus !== "in_progress";
  if (!view) {
    return {
      step,
      group: STEP_GROUP[step],
      stepTitle: STEP_TITLE[step],
      state: null,
      emptyReason: null,
      versions: [],
      changes: null,
      draft: null,
      contentSha256: null,
      outputSha256: null,
      readOnly: true,
      readOnlyReason: null,
      staleVersion: false,
      editable: false,
    };
  }

  const timeZone = workflow.timeZone;
  const label = sectionStateLabel(view.state);
  const analysis = analysisStatusText(workflow.facts.status);
  const shown = shownSectionContent(view.state);
  const emptyReason = view.output
    ? null
    : view.state.kind === "to-do"
      ? EMPTY_REASON[view.state.reason]
      : `${analysis.text}. ${analysis.detail}`;
  const staleVersion =
    view.state.kind === "out-of-date" || ((view.state.kind === "to-do" || view.state.kind === "updating") && view.state.version !== null);

  const versions: SectionVersionModel[] = view.versions.map((version, index) => {
    const previous = view.versions[index + 1];
    return {
      id: version.id,
      versionNumber: version.versionNumber,
      sourceText: versionSourceText(version),
      instruction: version.instruction,
      by: version.createdByName,
      at: dateOf(version.createdAt, timeZone),
      current: view.state.kind === "ready" && view.state.version?.id === version.id,
      currentAnalysis: view.output !== null && version.outputSha256 === view.output.contentSha256,
      changes: previous ? sectionDiff(previous.content, version.content) : null,
    };
  });

  return {
    step,
    group: STEP_GROUP[view.phase],
    stepTitle: STEP_TITLE[view.phase],
    state: { kind: label.kind, text: label.text, tone: label.tone },
    emptyReason,
    versions,
    changes: view.changes ? { added: view.changes.added, removed: view.changes.removed } : null,
    draft: view.state.kind === "out-of-date" && view.output ? { headline: view.output.headline, lines: view.output.lines } : null,
    contentSha256: shown ? contentSha256(shown) : null,
    outputSha256: view.output?.contentSha256 ?? null,
    readOnly,
    readOnlyReason: readOnlyReasonOf(workflow),
    staleVersion,
    editable: view.output !== null && !readOnly,
    revertAction: !readOnly && versions.length > 0 ? actions.revertAction : undefined,
    updateAction: !readOnly && view.state.kind === "out-of-date" ? actions.updateAction : undefined,
  };
}

export const OVERVIEW_HREF = (projectId: string) => `/projects/${projectId}/overview`;
