import type { Actor } from "@/modules/accounts";

import type { PhaseKey } from "./phases";
import { getWorkflow } from "./workflow";

// TechDesign/locked-report.md, "Before finishing" (F10 R13). Read-only and advisory: finishResearch's own
// transaction is what decides, so a page showing a stale list can't cause a bad publication. Its keys are
// a literal union with fixed labels in the route: no free text and no score.

export type FinishReadiness = {
  blocking: {
    key: "phase-not-reviewed" | "analysis-not-current" | "analysis-failed" | "filing-date-missing" | "nothing-changed";
    phase?: PhaseKey;
  }[];
  stated: {
    key: "evidence-gaps" | "source-disagreements" | "approximate-boundaries" | "desk-analysis-limits";
    count: number;
  }[];
};

export async function getFinishReadiness(actor: Actor, decisionId: string): Promise<FinishReadiness> {
  const w = await getWorkflow(actor, decisionId);
  const blocking: FinishReadiness["blocking"] = [];

  switch (w.facts.status.kind) {
    case "blocked":
      blocking.push({ key: "filing-date-missing" });
      break;
    case "failed":
      blocking.push({ key: "analysis-failed" });
      break;
    case "none":
    case "running":
    case "out-of-date":
      blocking.push({ key: "analysis-not-current" });
      break;
    case "current":
      break;
  }
  for (const view of w.phases) {
    if (view.state.kind !== "reviewed") blocking.push({ key: "phase-not-reviewed", phase: view.phase });
  }
  if (w.change && !w.change.hasChanges) blocking.push({ key: "nothing-changed" });

  const stated: FinishReadiness["stated"] = [];
  const run = w.facts.run;
  if (run && w.facts.rules) {
    stated.push({ key: "evidence-gaps", count: run.results.evidenceBase.gaps.length });
    stated.push({ key: "source-disagreements", count: run.results.evidenceBase.disagreements.length });
    stated.push({
      key: "approximate-boundaries",
      count: w.facts.rules.resourceTypes.filter((r) => r.mapStatus === "approximate").length,
    });
    stated.push({ key: "desk-analysis-limits", count: run.results.limits.length });
  }
  return { blocking, stated };
}
