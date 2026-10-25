import type { Actor } from "@/modules/accounts";
import { listDecisions, type Decision } from "@/modules/decisions";

import type { NextAction } from "./next-actions";
import { PHASES } from "./phases";
import type { PhaseView } from "./sections";
import { getWorkflow } from "./workflow";

// TechDesign/project-dashboard.md, "Data": the dashboard's per-project facts. Counts and words only —
// never a percentage, a score, or a rating (F18 R5). It calls getWorkflow for each project, so it is
// bounded by decisions.LIST_LIMIT rather than cached (Next.js data caching is forbidden for decisions).

export type ProjectSummary = {
  decision: Decision;
  state: "in-progress" | "finishing" | "completed";
  latestVersion: number | null;
  phasesReady: number;
  phasesTotal: number;
  nextAction: NextAction | null; // the first applicable action (F18 R6)
  phases: Pick<PhaseView, "phase" | "state">[]; // each phase's state, for the dashboard's status graphic
  usesSampleData: boolean;
  lastActivityAt: Date;
};

export async function listProjectSummaries(actor: Actor, jurisdictionId: string): Promise<ProjectSummary[]> {
  const decisions = await listDecisions(actor, jurisdictionId);
  return Promise.all(
    decisions.map(async (decision): Promise<ProjectSummary> => {
      const w = await getWorkflow(actor, decision.id);
      const versionTimes = w.phases.flatMap((p) => p.versions.map((v) => v.createdAt.getTime()));
      const lastActivityAt = new Date(
        Math.max(
          decision.createdAt.getTime(),
          w.facts.studyArea?.createdAt.getTime() ?? 0,
          w.facts.footprint?.createdAt.getTime() ?? 0,
          w.versions[0]?.releasedAt.getTime() ?? 0,
          ...versionTimes,
        ),
      );
      return {
        decision,
        state: w.decisionStatus === "report_released" ? "completed" : w.decisionStatus === "finishing" ? "finishing" : "in-progress",
        latestVersion: w.latestVersion,
        phasesReady: w.phases.filter((p) => p.state.kind === "ready").length,
        phasesTotal: PHASES.length,
        nextAction: w.nextActions[0] ?? null,
        phases: w.phases.map(({ phase, state }) => ({ phase, state })),
        usesSampleData: w.usesSampleData,
        lastActivityAt,
      };
    }),
  );
}
