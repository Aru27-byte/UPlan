import type { PhaseKey, Workflow } from "@/modules/workflow";
import type { PhaseViewModel } from "@/ui/phase/types";

import { projectHref, toPhaseViewModel } from "./workflow-labels";

// Where each phase's inputs are changed (research-phases.md R9). Iterating on an output means changing one
// of these and reading the new draft, so every phase page names them beside the output it affects.
const CHANGE_LINKS: Record<PhaseKey, (projectId: string) => PhaseViewModel["changeLinks"]> = {
  site: (id) => [
    { label: "Change the study area on this page", href: `${projectHref(id, "site")}#study-area` },
    { label: "Change the project details", href: projectHref(id, "overview") },
  ],
  evidence: (id) => [
    { label: "Change the study area", href: projectHref(id, "site") },
    { label: "See the city profile and its datasets", href: "/profile" },
  ],
  screening: (id) => [
    { label: "Change the study area", href: projectHref(id, "site") },
    { label: "See the city profile's rules", href: "/profile" },
  ],
  studies: (id) => [
    { label: "Change the study area", href: projectHref(id, "site") },
    { label: "See the city profile's study triggers", href: "/profile" },
  ],
  footprint: (id) => [
    { label: "Change the footprint on this page", href: `${projectHref(id, "footprint")}#footprint` },
    { label: "Change the study area", href: projectHref(id, "site") },
  ],
  impact: (id) => [
    { label: "Change the footprint", href: projectHref(id, "footprint") },
    { label: "Change the study area", href: projectHref(id, "site") },
    { label: "Change the project details", href: projectHref(id, "overview") },
  ],
};

export function phaseModel(workflow: Workflow, projectId: string, phase: PhaseKey): PhaseViewModel {
  const view = workflow.phases.find((p) => p.phase === phase);
  if (!view) throw new Error(`the workflow has no ${phase} phase`);
  return toPhaseViewModel(view, workflow, CHANGE_LINKS[phase](projectId), []);
}
