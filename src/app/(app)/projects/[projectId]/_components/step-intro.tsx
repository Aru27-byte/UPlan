import { loadProject } from "@/app/_lib/project";
import { REPORT_SECTIONS } from "@/app/_lib/report-sections";
import { STEP_GROUP, STEP_TITLE } from "@/app/_lib/workflow-labels";
import { formatTimestamp } from "@/modules/provenance";
import { listSectionFeedback, type FeedbackStep } from "@/modules/workflow";
import { ReportSectionPanel } from "@/ui/phase/report-section-panel.client";

import { recordSectionFeedbackAction } from "../actions";

// The top of every step page except Report (research-phases.md R15): the report section the step feeds, and
// the box for feedback on it. It reads through loadProject, which the layout and the page already share.
export async function StepIntro({ projectId, step }: { projectId: string; step: FeedbackStep }) {
  const { actor, workflow: w } = await loadProject(projectId);
  const feedback = await listSectionFeedback(actor, projectId, step);
  return (
    <ReportSectionPanel
      model={{
        step,
        group: STEP_GROUP[step],
        stepTitle: STEP_TITLE[step],
        sections: REPORT_SECTIONS[step],
        feedback: feedback.map((f) => ({ id: f.id, note: f.note, by: f.by, at: formatTimestamp(f.at, w.timeZone) })),
        readOnly: w.decisionStatus !== "in_progress",
      }}
      action={recordSectionFeedbackAction.bind(null, projectId)}
    />
  );
}
