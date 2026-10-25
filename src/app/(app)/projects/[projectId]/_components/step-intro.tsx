import { respondAssistAction } from "@/app/_lib/assist-actions";
import { sectionChatModel } from "@/app/_lib/assist-view";
import { loadProject } from "@/app/_lib/project";
import { shownSectionContent, toReportSectionModel } from "@/app/_lib/workflow-labels";
import type { PhaseKey } from "@/app/_lib/workflow-types";
import { ReportSectionPanel } from "@/ui/phase/report-section-panel.client";

import { changeSectionAction, explainSectionAction, revertSectionAction, updateSectionAction } from "../actions";

import { SectionPreview } from "./section-preview";

// The top of every step page except Report (research-phases.md R1, R6): the report section the step produces,
// shown as the document will print it, with the section chat beside it. It reads through loadProject, which the
// layout and the page already share, so one request reads the project once.
export async function StepIntro({ projectId, step }: { projectId: string; step: "overview" | PhaseKey }) {
  const { actor, workflow: w } = await loadProject(projectId);
  const view = step === "overview" ? null : w.phases.find((p) => p.phase === step);
  if (step !== "overview" && !view) throw new Error(`the workflow has no ${step} phase`);

  const model = toReportSectionModel(view ?? null, w, step, {
    revertAction: revertSectionAction.bind(null, projectId),
    updateAction: updateSectionAction.bind(null, projectId),
  });
  const chat = view
    ? await sectionChatModel({
        actor,
        workflow: w,
        decisionId: projectId,
        phase: view.phase,
        explainAction: explainSectionAction.bind(null, projectId),
        changeAction: changeSectionAction.bind(null, projectId),
        respondAction: respondAssistAction,
      })
    : null;

  return (
    <ReportSectionPanel model={model} chat={chat} projectId={projectId}>
      <SectionPreview workflow={w} step={step} content={view ? shownSectionContent(view.state) : null} />
    </ReportSectionPanel>
  );
}
