"use server";

import { z } from "zod";

import { requireActor } from "@/app/_lib/actor";
import { optionalText, requiredInt, requiredText, requiredUuid, runAction, runChatAction } from "@/app/_lib/action-state";
import { suggestionPlainText } from "@/app/_lib/assist-view";
import { saveResolution } from "@/modules/analysis";
import { StoredAssistIdSchema, listPhaseSuggestions, requestSectionSuggestion, type SuggestionView, saveChatMessage, listChatMessages } from "@/modules/assist";
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
import { PHASES, cancelResearchChange, finishResearch, revertSection, updateSectionToCurrent } from "@/modules/workflow";
import { ValidationError } from "@/platform/errors";
import type { ActionState } from "@/ui/action-state";
import { logger } from "@/platform/logger";

// Server Functions for one project's pages (TechDesign/research-phases.md, "Server Functions"). Each one
// authenticates, reads its form, calls ONE module function, and returns a message — the module function
// checks ownership, the project's status, and the compare-and-set itself. `projectId` is bound by the page
// (`action.bind(null, projectId)`), so it never travels in a form field a person could edit.

const HashSchema = z.string().regex(/^[0-9a-f]{64}$/, "Reload the page and try again.");

const SectionChatFormSchema = z.object({
  phase: z.enum(PHASES),
  assistId: z.string().nullable(),
  instruction: z.string().trim().min(1, "Type a question or a change.").max(2000, "Keep the message under 2,000 characters."),
  expectedContentSha256: HashSchema,
  expectedOutputSha256: HashSchema,
});

function sectionChatForm(formData: FormData) {
  const form = SectionChatFormSchema.safeParse({
    phase: formData.get("phase"),
    assistId: formData.get("assistId"),
    instruction: formData.get("instruction"),
    expectedContentSha256: formData.get("expectedContentSha256"),
    expectedOutputSha256: formData.get("expectedOutputSha256"),
  });
  if (!form.success) throw new ValidationError(form.error.issues[0]?.message ?? "This form is out of date. Reload the page and try again.");
  return form.data;
}

function suggestionNotice(status: SuggestionView["status"]): string {
  if (status === "ready") return "The answer is below, labeled as UPlan Assist.";
  if (status === "rejected") return "UPlan Assist's answer failed UPlan's checks, so none of it is shown as an answer. The reasons are below.";
  if (status === "failed") return "UPlan Assist did not finish. The reason is below, and nothing has replaced it.";
  return "The request is still running. Reload the page in a minute.";
}

type SectionChatResult = ActionState & { data?: SuggestionView };

/** Explain changes nothing: a question and its answer, recorded beside the section (research-phases.md R6). */
export async function explainSectionAction(projectId: string, _previous: ActionState, formData: FormData): Promise<SectionChatResult> {
  return runChatAction(async () => {
    const { actor } = await requireActor();
    const form = sectionChatForm(formData);
    const assistId = form.assistId === null || form.assistId === "" ? "section-explain" : form.assistId;
    const parsed = StoredAssistIdSchema.safeParse(assistId);
    if (!parsed.success) throw new ValidationError("This form is out of date. Reload the page and try again.");
    logger.info({ projectId, phase: form.phase, assistId: parsed.data, instruction: form.instruction }, "Explain section request");
    const result = await requestSectionSuggestion(actor, {
      assistId: parsed.data,
      decisionId: projectId,
      phase: form.phase,
      instruction: form.instruction,
      expectedContentSha256: form.expectedContentSha256,
      expectedOutputSha256: form.expectedOutputSha256,
    });
    logger.info({ projectId, phase: form.phase, suggestionId: result.id, status: result.status }, "Explain section response");
    return { notice: suggestionNotice(result.status), data: result };
  });
}

/** Change rewrites the narrative and stores a version in the same transaction (research-phases.md R7, R8). */
export async function changeSectionAction(projectId: string, _previous: ActionState, formData: FormData): Promise<SectionChatResult> {
  return runChatAction(async () => {
    const { actor } = await requireActor();
    const form = sectionChatForm(formData);
    logger.info({ projectId, phase: form.phase, instruction: form.instruction }, "Change section request");
    const result = await requestSectionSuggestion(actor, {
      assistId: "section-edit",
      decisionId: projectId,
      phase: form.phase,
      instruction: form.instruction,
      expectedContentSha256: form.expectedContentSha256,
      expectedOutputSha256: form.expectedOutputSha256,
    });
    logger.info({ projectId, phase: form.phase, suggestionId: result.id, status: result.status }, "Change section response");
    if (result.status === "ready") return { notice: "The section changed. The new version is in the history.", data: result };
    return { notice: suggestionNotice(result.status), data: result };
  });
}

const RevertFormSchema = z.object({
  phase: z.enum(PHASES),
  versionId: z.uuid(),
  expectedContentSha256: HashSchema,
  expectedOutputSha256: HashSchema,
});

export async function revertSectionAction(projectId: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await requireActor();
    const form = RevertFormSchema.safeParse({
      phase: formData.get("phase"),
      versionId: formData.get("versionId"),
      expectedContentSha256: formData.get("expectedContentSha256"),
      expectedOutputSha256: formData.get("expectedOutputSha256"),
    });
    if (!form.success) throw new ValidationError("This form is out of date. Reload the page and try again.");
    await revertSection(actor, projectId, form.data);
    return "The earlier version is the current wording. It stays in the history.";
  });
}

const UpdateSectionFormSchema = z.object({
  phase: z.enum(PHASES),
  expectedContentSha256: HashSchema,
  expectedOutputSha256: HashSchema,
});

export async function updateSectionAction(projectId: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await requireActor();
    const form = UpdateSectionFormSchema.safeParse({
      phase: formData.get("phase"),
      expectedContentSha256: formData.get("expectedContentSha256"),
      expectedOutputSha256: formData.get("expectedOutputSha256"),
    });
    if (!form.success) throw new ValidationError("This form is out of date. Reload the page and try again.");
    await updateSectionToCurrent(actor, projectId, form.data);
    return "The section now matches the current analysis.";
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

const SaveChatMessageSchema = z.object({
  phase: z.enum(PHASES),
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(10000),
  // A blank optional field arrives as "" from a FormData (never null), so both are normalised before parsing.
  instruction: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().max(2000).nullable(),
  ),
  suggestionId: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.uuid().nullable(),
  ),
});

export async function saveChatMessageAction(projectId: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  return runChatAction(async () => {
    const { actor } = await requireActor();
    const form = SaveChatMessageSchema.safeParse({
      phase: formData.get("phase"),
      role: formData.get("role"),
      content: formData.get("content"),
      instruction: formData.get("instruction"),
      suggestionId: formData.get("suggestionId"),
    });
    if (!form.success) throw new ValidationError("Invalid chat message data.");
    // An assistant row's answer is owned by the suggestion, not by the browser that asked for it: write the
    // suggestion's own text so history is complete even if the page's copy of the answer is stale.
    let content = form.data.content;
    if (form.data.role === "assistant" && form.data.suggestionId) {
      const suggestions = await listPhaseSuggestions(actor, projectId, form.data.phase);
      const suggestion = suggestions.find((candidate) => candidate.id === form.data.suggestionId);
      if (suggestion) content = suggestionPlainText(suggestion);
    }
    await saveChatMessage(actor, projectId, form.data.phase, form.data.role, content, form.data.instruction, form.data.suggestionId);
    return { notice: "Chat message saved.", data: true };
  });
}

export type LoadedChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  instruction: string | null;
  suggestionId: string | null;
  createdAt: string;
};

export async function loadChatMessagesAction(
  projectId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState & { data?: LoadedChatMessage[] }> {
  return runChatAction(async () => {
    const { actor } = await requireActor();
    const phaseRaw = formData.get("phase");
    const phase = typeof phaseRaw === "string" ? phaseRaw : "";
    if (!phase || !PHASES.includes(phase as (typeof PHASES)[number])) throw new ValidationError("Invalid phase.");
    const messages = await listChatMessages(actor, projectId, phase);
    const messageList: LoadedChatMessage[] = messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      instruction: m.instruction,
      suggestionId: m.suggestionId,
      // An ISO string rather than a Date: it crosses the Server Function boundary unchanged.
      createdAt: m.createdAt.toISOString(),
    }));
    return { notice: "Chat messages loaded.", data: messageList };
  });
}

