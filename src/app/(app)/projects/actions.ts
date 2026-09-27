"use server";

import { redirect } from "next/navigation";

import { requireActor } from "@/app/_lib/actor";
import { optionalText, requiredInt, requiredText, requiredUuid, runAction } from "@/app/_lib/action-state";
import { ApplicationTypeSchema, createDecision, createSampleProject, deleteDecision, reopen } from "@/modules/decisions";
import { ValidationError } from "@/platform/errors";
import type { ActionState } from "@/ui/action-state";

// Server Functions shared by the dashboard, the new-research page, and the project Overview
// (TechDesign/project-dashboard.md, "Server Function pattern"). Each authenticates, reads its form, calls
// ONE module function, and returns a message or redirects. None decides anything: ownership, the status
// checks, and the compare-and-set all happen inside the module function.

const STEPS = ["overview", "site", "evidence", "screening", "studies", "footprint", "impact", "report"] as const;

export async function createProjectAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await requireActor();
    const applicationType = ApplicationTypeSchema.safeParse(formData.get("applicationType"));
    if (!applicationType.success) throw new ValidationError("Choose an application type.");
    const project = await createDecision(actor, {
      jurisdictionId: requiredUuid(formData, "jurisdictionId", "The city"),
      title: requiredText(formData, "title", "The title"),
      applicationType: applicationType.data,
      parcelOrAddress: optionalText(formData, "parcelOrAddress"),
      applicant: optionalText(formData, "applicant"),
      projectManager: optionalText(formData, "projectManager"),
      targetDecisionOn: optionalText(formData, "targetDecisionOn"),
      applicationFiledOn: optionalText(formData, "applicationFiledOn"),
    });
    redirect(`/projects/${project.id}/overview`);
  });
}

export async function createSampleProjectAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await requireActor();
    const project = await createSampleProject(actor, requiredUuid(formData, "jurisdictionId", "The city"));
    redirect(`/projects/${project.id}/overview`);
  });
}

export async function deleteProjectAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await requireActor();
    await deleteDecision(actor, requiredUuid(formData, "projectId", "The project"), requiredInt(formData, "rowVersion"));
    return "The research was deleted from view. Its records are kept.";
  });
}

/**
 * F22 R3, R4: starting a research change is explicit, and may begin at a chosen step (a new site boundary, a
 * new footprint, or any phase). It first moves the project back to in progress, then goes there.
 */
export async function startResearchChangeAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await requireActor();
    const projectId = requiredUuid(formData, "projectId", "The project");
    const next = optionalText(formData, "next") ?? "overview";
    if (!(STEPS as readonly string[]).includes(next)) throw new ValidationError("That isn't a step of the research.");
    await reopen(actor, projectId, requiredInt(formData, "rowVersion"));
    redirect(`/projects/${projectId}/${next}`);
  });
}
