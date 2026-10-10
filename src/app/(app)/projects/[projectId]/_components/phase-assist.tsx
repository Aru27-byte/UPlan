import { respondAssistAction } from "@/app/_lib/assist-actions";
import { phaseAssistPanel } from "@/app/_lib/assist-view";
import type { Actor } from "@/modules/accounts";
import type { Workflow } from "@/modules/workflow";
import { AssistPanel } from "@/ui/phase/assist-panel";
import type { StepGroup } from "@/ui/phase/group-tones";

import { requestAssistAction } from "../actions";

// The AI assist panel of one analysis phase (TechDesign/ai-assist.md, F24 R18). Evidence, Screening, Studies, and
// Impact have one; Site and Footprint have none, because a boundary is the planner's own act. It is rendered
// beside the drafted output by PhasePage and reads no part of the phase's own state.
export async function PhaseAssist({
  projectId,
  phase,
  actor,
  workflow,
  group,
}: {
  projectId: string;
  phase: "evidence" | "screening" | "studies" | "impact";
  actor: Actor;
  workflow: Workflow;
  group: StepGroup;
}) {
  const model = await phaseAssistPanel({
    actor,
    workflow,
    phase,
    group,
    decisionId: projectId,
    requestAction: (assistId) => requestAssistAction.bind(null, projectId, assistId),
    respondAction: respondAssistAction,
  });
  return <AssistPanel model={model} id={`assist-${phase}`} />;
}
