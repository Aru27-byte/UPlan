import { loadProject } from "@/app/_lib/project";
import { REPORT_SECTIONS } from "@/app/_lib/report-sections";
import { STEP_GROUP, STEP_TITLE } from "@/app/_lib/workflow-labels";
import { formatTimestamp } from "@/modules/provenance";
import { listSectionFeedbackInternal, type FeedbackStep } from "@/modules/workflow";
import { ReportSectionPanel } from "@/ui/phase/report-section-panel.client";

import { recordSectionFeedbackAction } from "../actions";

// The top of every step page except Report (research-phases.md R15): the report section the step feeds, and
// the box for feedback on it. It reads through loadProject, which the layout and the page already share.
export async function StepIntro({ projectId, step }: { projectId: string; step: FeedbackStep }) {
  // loadProject is the ownership check (a project that isn't theirs is a 404 before anything renders), so the
  // feedback read runs beside it rather than after it: each sequential read is a full database round trip.
  const [{ workflow: w }, feedback] = await Promise.all([
    loadProject(projectId),
    listSectionFeedbackInternal(projectId, step),
  ]);
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
