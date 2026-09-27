import type { NextAction, PhaseKey, PhaseReview, PhaseView, StepState, Workflow } from "@/modules/workflow";
import { formatTimestamp } from "@/modules/provenance";
import type { AnalysisStatus, InputChange } from "@/modules/analysis";
import type { PhaseViewModel } from "@/ui/phase/types";
import type { StatusTone } from "@/ui/status-label";

// App-layer glue: the words the pages use for the workflow's states, in one place, so the rail, the
// Overview, the dashboard, and every phase page say the same thing. Every label states a state and none
// states a verdict: nothing here says done, complete, clear, safe, or approved (F18 R2, P2).

export const PHASE_TITLE: Record<PhaseKey, string> = {
  site: "Site",
  evidence: "Evidence",
  screening: "Screening",
  studies: "Studies",
  footprint: "Footprint",
  impact: "Impact",
};

export const STEP_TITLE = { overview: "Overview", ...PHASE_TITLE, report: "Report" } as const;

export const STEP_GROUP: Record<keyof typeof STEP_TITLE, string> = {
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

/** The text and tone for a phase's review state (research-phases.md R5). */
export function reviewStateLabel(state: PhaseView["state"]): Labelled & { kind: PhaseViewModel["state"]["kind"] } {
  switch (state.kind) {
    case "to-do":
      return { kind: "to-do", text: "To do", tone: "neutral" };
    case "updating":
      // A failed or blocked analysis is not "updating": it needs the planner's eye (F18 R2).
      return state.status.kind === "failed" || state.status.kind === "blocked"
        ? { kind: "updating", text: "Needs attention", tone: "danger" }
        : { kind: "updating", text: "Updating", tone: "info" };
    case "needs-review":
      return { kind: "needs-review", text: "Needs review", tone: "warn" };
    case "reviewed":
      return { kind: "reviewed", text: "Reviewed", tone: "ok" };
    case "revision-requested":
      return { kind: "revision-requested", text: "Revision requested", tone: "warn" };
  }
}

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
  return reviewStateLabel(step.state);
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
  "review-site": "Review the Site output.",
  "review-evidence": "Review the Evidence output.",
  "review-disagreements": "Record which source you rely on where two sources disagree.",
  "review-screening": "Review the Screening register.",
  "review-studies": "Review the Studies output.",
  "trace-footprint": "Add the proposal's footprint: trace it, upload a boundary, or load the sample.",
  "review-footprint": "Review the Footprint output.",
  "review-impact": "Review the Impact output.",
  "finish-research": "Every phase is reviewed. Finish research to publish the final document.",
  "start-research-change": "This project is completed. Start a research change to update it.",
};

const dateOf = (instant: Date, timeZone: string) => formatTimestamp(instant, timeZone);

const VERDICT: Record<PhaseReview["verdict"], Labelled> = {
  reviewed: { text: "Reviewed", tone: "ok" },
  revision_requested: { text: "Revision requested", tone: "warn" },
};

const EMPTY_REASON = {
  "no-study-area": "This phase needs a study area. Add one on the Site page.",
  "no-footprint": "This phase needs a footprint. Add one on the Footprint page.",
} as const satisfies Record<Extract<PhaseView["state"], { kind: "to-do" }>["reason"], string>;

/** Builds the plain shape a phase page renders from workflow's PhaseView, formatting every date here. */
export function toPhaseViewModel(
  view: PhaseView,
  workflow: Workflow,
  changeLinks: PhaseViewModel["changeLinks"],
  inputs: PhaseViewModel["inputs"],
): PhaseViewModel {
  const label = reviewStateLabel(view.state);
  const timeZone = workflow.timeZone;
  const readOnly = workflow.decisionStatus !== "in_progress";
  const analysis = analysisStatusText(workflow.facts.status);

  let emptyReason: string | null = null;
  if (!view.output) {
    emptyReason =
      view.state.kind === "to-do"
        ? EMPTY_REASON[view.state.reason]
        : `${analysis.text}. ${analysis.detail}`;
  }

  return {
    phase: view.phase,
    title: PHASE_TITLE[view.phase],
    state: { kind: label.kind, text: label.text, tone: label.tone },
    output: view.output
      ? { headline: view.output.headline, lines: view.output.lines, contentSha256: view.output.contentSha256 }
      : null,
    emptyReason,
    inputs: inputs.length > 0 ? inputs : (view.output?.inputs ?? []),
    changeLinks,
    changes:
      view.changes && view.state.kind === "needs-review" && view.state.changedSince
        ? { added: view.changes.added, removed: view.changes.removed, since: dateOf(view.state.changedSince.reviewedAt, timeZone) }
        : null,
    history: view.history.map((r) => ({
      id: r.id,
      verdictText: VERDICT[r.verdict].text,
      tone: VERDICT[r.verdict].tone,
      note: r.note,
      by: r.reviewedByName,
      at: dateOf(r.reviewedAt, timeZone),
      headline: r.summary.headline,
      lines: r.summary.lines,
    })),
    readOnly,
    readOnlyReason: !readOnly
      ? null
      : workflow.decisionStatus === "finishing"
        ? "A document is being generated for this project, so nothing can change until it finishes."
        : `Version ${publishedVersion(workflow.latestVersion)} is published. Start a research change on the Overview to review or edit this phase.`,
  };
}

export const OVERVIEW_HREF = (projectId: string) => `/projects/${projectId}/overview`;
