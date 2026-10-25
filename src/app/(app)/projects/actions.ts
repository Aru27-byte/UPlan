"use server";

import { redirect } from "next/navigation";

import { requireActor } from "@/app/_lib/actor";
import { optionalText, requiredInt, requiredText, requiredUuid, runAction, runChatAction } from "@/app/_lib/action-state";
import {
  ApplicationTypeSchema,
  SAMPLE_STUDY_AREA,
  createDecision,
  createSampleProject,
  deleteDecision,
  reopen,
} from "@/modules/decisions";
import { jurisdictionCovers } from "@/modules/profiles";
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
    const jurisdictionId = requiredUuid(formData, "jurisdictionId", "The city");
    // F23 R10: the sample site is in Sammamish. The check lives here because `decisions` cannot import `profiles`.
    if (!(await jurisdictionCovers(jurisdictionId, SAMPLE_STUDY_AREA))) {
      throw new ValidationError("Sample data is placed in Sammamish, so it can't be started in this city. Start new research instead.");
    }
    const project = await createSampleProject(actor, jurisdictionId);
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

export async function scanDocumentAction(_previous: ActionState, formData: FormData): Promise<ActionState & { fields?: { title?: string; parcelOrAddress?: string; applicant?: string; projectManager?: string; applicationFiledOn?: string; targetDecisionOn?: string; applicationType?: string } }> {
  return runChatAction(async () => {
    const { actor } = await requireActor();
    const file = formData.get("document");
    if (!(file instanceof File) || file.size === 0) {
      return { notice: "No file uploaded.", data: undefined };
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new ValidationError("File too large. Maximum 5 MB.");
    }
    const allowedTypes = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"];
    if (!allowedTypes.includes(file.type)) {
      throw new ValidationError("Unsupported file type. Use PDF, DOCX, or TXT.");
    }
    const text = await file.text();
    if (!text.trim()) {
      return { notice: "Could not extract text from the document.", data: undefined };
    }
    // Use AI to extract structured fields
    const { scanDocument } = await import("@/modules/assist/scan");
    const extracted = await scanDocument(actor, text);
    return { notice: "Document scanned. Review the extracted fields below.", data: extracted };
  });
}

export async function askDashboardQuestionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await requireActor();
    const question = formData.get("question");
    if (!question || typeof question !== "string" || !question.trim()) {
      throw new ValidationError("Please enter a question.");
    }
    const cityId = formData.get("cityId");
    if (!cityId || typeof cityId !== "string") {
      throw new ValidationError("Missing city context.");
    }
    const actorId = formData.get("actorId");
    if (!actorId || typeof actorId !== "string") {
      throw new ValidationError("Missing actor context.");
    }

    // Use AI to answer the dashboard question
    const { answerDashboardQuestion } = await import("@/modules/assist/dashboard");
    const answer = await answerDashboardQuestion(actor, cityId, question.trim());
    return answer;
  });
}
