import type { Actor } from "@/modules/accounts";
import { DecisionStatusSchema, getDecision, type Decision, type DecisionStatus } from "@/modules/decisions";
import { getLatestReleasedSnapshot, listDocumentVersionsInternal, type DocumentVersion, type ReportDetails } from "@/modules/reports";
import { db } from "@/platform/db";

import { summarizeChanges, type ChangeSummary } from "./changes";
import { loadPhaseFacts } from "./facts";
import { deriveNextActions, type NextAction } from "./next-actions";
import { buildPhaseViews, countUnresolvedDisagreements, type PhaseFacts, type PhaseView } from "./phases";
import { listReviewsInternal } from "./reviews";
import { deriveSteps, type StepState } from "./steps";

// TechDesign/decision-overview.md and research-phases.md: the one read behind the stage rail, the
// Overview, every phase page, and the dashboard. It combines decisions, analysis, profiles, and reports,
// which is why it lives in its own module (a route calling four functions would put domain rules in
// src/app/, and a place inside any of the four would make an import cycle).

export type Workflow = {
  decision: Decision;
  decisionStatus: DecisionStatus;
  cityName: string;
  timeZone: string;
  facts: PhaseFacts;
  phases: PhaseView[];
  steps: StepState[];
  nextActions: NextAction[];
  usesSampleData: boolean;
  unresolvedDisagreements: number;
  versions: DocumentVersion[]; // newest first
  latestVersion: number | null;
  // Present while a research change is open: what differs from the last published version (F22 R5).
  change: ChangeSummary | null;
};

export function detailsOf(decision: Decision, usesSampleData: boolean): ReportDetails {
  return {
    title: decision.title,
    applicationType: decision.applicationType as ReportDetails["applicationType"],
    permitNumber: decision.permitNumber,
    parcelOrAddress: decision.parcelOrAddress,
    applicant: decision.applicant,
    projectManager: decision.projectManager,
    targetDecisionOn: decision.targetDecisionOn,
    applicationFiledOn: decision.applicationFiledOn,
    usesSampleData,
  };
}

export async function getWorkflow(actor: Actor, decisionId: string): Promise<Workflow> {
  const decision = await getDecision(actor, decisionId);
  const decisionStatus = DecisionStatusSchema.parse(decision.status);
  // The three reads touch different tables and none needs another's result, so they overlap: this runs on
  // every project page, and each sequential read costs a full database round trip. The decision above is
  // read first and alone because it is the ownership check.
  const [{ facts, usesSampleData, cityName, timeZone }, reviews, versions] = await Promise.all([
    loadPhaseFacts(decision),
    listReviewsInternal(decision.id),
    listDocumentVersionsInternal(decision.id),
  ]);
  const phases = buildPhaseViews(facts, reviews);
  const latestVersion = versions[0]?.versionNumber ?? null;
  const unresolvedDisagreements = countUnresolvedDisagreements(facts);

  const workflowFacts = { phases, status: facts.status, unresolvedDisagreements, decisionStatus, latestVersion };

  // An open research change: a published version exists and the project is being changed again.
  let change: ChangeSummary | null = null;
  if (latestVersion !== null && decisionStatus !== "report_released") {
    const base = await getLatestReleasedSnapshot(db, decision.id);
    if (base) change = summarizeChanges(phases, base, detailsOf(decision, usesSampleData));
  }

  return {
    decision,
    decisionStatus,
    cityName,
    timeZone,
    facts,
    phases,
    steps: deriveSteps(workflowFacts),
    nextActions: deriveNextActions(workflowFacts),
    usesSampleData,
    unresolvedDisagreements,
    versions,
    latestVersion,
    change,
  };
}
