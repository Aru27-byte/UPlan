"use server";

import { z } from "zod";

import { requireActor } from "@/app/_lib/actor";
import { optionalText, requiredInt, requiredText, requiredUuid, runAction } from "@/app/_lib/action-state";
import { saveResolution } from "@/modules/analysis";
import {
  ApplicationTypeSchema,
  MAX_UPLOAD_BYTES,
  loadSampleDetails,
  loadSampleGeometry,
  saveGeometry,
  saveGeometryFromUpload,
  updateDecisionDetails,
  type GeometryKind,
} from "@/modules/decisions";
import { PHASES, cancelResearchChange, finishResearch, recordReview } from "@/modules/workflow";
import { ValidationError } from "@/platform/errors";
import type { ActionState } from "@/ui/action-state";

// Server Functions for one project's pages (TechDesign/research-phases.md, "Server Functions"). Each one
// authenticates, reads its form, calls ONE module function, and returns a message — the module function
// checks ownership, the project's status, and the compare-and-set itself. `projectId` is bound by the page
// (`action.bind(null, projectId)`), so it never travels in a form field a person could edit.

const ReviewFormSchema = z.object({
  phase: z.enum(PHASES),
  verdict: z.enum(["reviewed", "revision_requested"]),
  note: z.string().nullable(),
  expectedContentSha256: z.string(),
});

export async function recordReviewAction(projectId: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await requireActor();
    const form = ReviewFormSchema.safeParse({
      phase: formData.get("phase"),
      verdict: formData.get("verdict"),
      note: optionalText(formData, "note"),
      expectedContentSha256: formData.get("expectedContentSha256"),
    });
    if (!form.success) throw new ValidationError("This form is out of date. Reload the page and try again.");
    const review = await recordReview(actor, projectId, form.data);
    return review.verdict === "reviewed" ? "Review recorded." : "Revision requested. Change an input above, then review the new draft.";
  });
}

export async function saveDetailsAction(projectId: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await requireActor();
    const applicationType = ApplicationTypeSchema.safeParse(formData.get("applicationType"));
    if (!applicationType.success) throw new ValidationError("Choose an application type.");
    // A blank field is sent as "" and the module stores it as "not recorded" (F5 R10).
    await updateDecisionDetails(
      actor,
      projectId,
      {
        title: requiredText(formData, "title", "The title"),
        applicationType: applicationType.data,
        parcelOrAddress: optionalText(formData, "parcelOrAddress") ?? "",
        applicant: optionalText(formData, "applicant") ?? "",
        projectManager: optionalText(formData, "projectManager") ?? "",
        targetDecisionOn: optionalText(formData, "targetDecisionOn") ?? "",
        applicationFiledOn: optionalText(formData, "applicationFiledOn") ?? "",
      },
      requiredInt(formData, "rowVersion"),
    );
    return "Project details saved.";
  });
}

export async function loadSampleDetailsAction(projectId: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await requireActor();
    await loadSampleDetails(actor, projectId, requiredInt(formData, "rowVersion"));
    return "Sample details loaded.";
  });
}

const KindSchema = z.enum(["study_area", "footprint"]);

export async function loadSampleBoundaryAction(
  projectId: string,
  kind: GeometryKind,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await requireActor();
    await loadSampleGeometry(actor, projectId, KindSchema.parse(kind), requiredInt(formData, "expectedRevision"));
    return kind === "study_area" ? "Sample study area loaded." : "Sample footprint loaded.";
  });
}

export async function uploadBoundaryAction(
  projectId: string,
  kind: GeometryKind,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await requireActor();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new ValidationError("Choose a .geojson file to upload.");
    // Checked before reading, so an oversized file is never held in memory.
    if (file.size > MAX_UPLOAD_BYTES) throw new ValidationError("That file is larger than 2 MB.");
    await saveGeometryFromUpload(
      actor,
      projectId,
      KindSchema.parse(kind),
      { name: file.name, text: await file.text() },
      requiredInt(formData, "expectedRevision"),
    );
    return "Boundary uploaded.";
  });
}

/** Called by the map editor with the traced shape. Returns the error text instead of throwing, because a thrown message doesn't reach the browser in production. */
export async function saveDrawnBoundaryAction(
  projectId: string,
  kind: GeometryKind,
  geojson: unknown,
  sourceNote: string,
  expectedRevision: number,
): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await requireActor();
    await saveGeometry(actor, projectId, KindSchema.parse(kind), geojson, sourceNote, expectedRevision);
    return "Saved.";
  });
}

const ReliedOnSchema = z.enum(["mapped_by", "not_mapped_by", "neither"]);

export async function saveResolutionAction(projectId: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await requireActor();
    const reliedOn = ReliedOnSchema.safeParse(formData.get("reliedOn"));
    if (!reliedOn.success) throw new ValidationError("Choose which source you rely on.");
    await saveResolution(actor, projectId, {
      resourceType: requiredText(formData, "resourceType", "The resource type"),
      mappedBy: requiredUuid(formData, "mappedBy", "The mapped source"),
      notMappedBy: requiredUuid(formData, "notMappedBy", "The other source"),
      reliedOn: reliedOn.data,
      rationale: requiredText(formData, "rationale", "Your reason"),
      expectedRevision: requiredInt(formData, "expectedRevision"),
    });
    return "Your reasoning was recorded. Both sources stay shown.";
  });
}

export async function finishResearchAction(projectId: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await requireActor();
    await finishResearch(actor, projectId, {
      changeNote: optionalText(formData, "changeNote"),
      expectedRowVersion: requiredInt(formData, "rowVersion"),
    });
    return "The final document is being generated.";
  });
}

export async function cancelResearchChangeAction(projectId: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await requireActor();
    await cancelResearchChange(actor, projectId, requiredInt(formData, "rowVersion"));
    return "The research change was cancelled. The last published version is current again.";
  });
}
