"use server";

import { z } from "zod";

import { requireActor } from "@/app/_lib/actor";
import { optionalText, requiredText, requiredUuid, runAction } from "@/app/_lib/action-state";
import { installSampleEvidence } from "@/modules/evidence";
import { decideChange, proposeUpload } from "@/modules/profiles";
import { formatCount } from "@/modules/provenance";
import { ConflictError, ValidationError, isUniqueViolation } from "@/platform/errors";
import type { ActionState } from "@/ui/action-state";

// Server Functions for the city profile page. Each authenticates, reads its form, calls ONE module
// function, and returns a message. Who may do what is decided inside the module function: any signed-in
// person may propose a change, and only UPlan staff decide one or install sample evidence
// (accounts-roles.md).

const MAX_WORKBOOK_BYTES = 5 * 1024 * 1024;

export async function uploadProfileAction(jurisdictionId: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await requireActor();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new ValidationError("Choose a workbook (.xlsx) to upload.");
    if (!/\.xlsx$/i.test(file.name)) throw new ValidationError("Upload an Excel workbook (.xlsx). Download the template for the layout.");
    if (file.size > MAX_WORKBOOK_BYTES) throw new ValidationError("That file is larger than 5 MB.");
    const reason = requiredText(formData, "reason", "A reason for this change");

    let result: Awaited<ReturnType<typeof proposeUpload>>;
    try {
      result = await proposeUpload(actor, jurisdictionId, Buffer.from(await file.arrayBuffer()), reason);
    } catch (err) {
      // profile_upload is unique on (city, file hash): the same workbook can't be uploaded twice.
      if (isUniqueViolation(err)) throw new ConflictError("This exact workbook was already uploaded. Change it, or see the change history.");
      throw err;
    }
    const { upload, change } = result;
    if (!change) {
      throw new ValidationError(`The workbook can't be used. ${upload.validationErrors.join(" ")}`);
    }
    return "Your workbook was accepted as a proposed change. UPlan staff review it before it applies to any project.";
  });
}

const OutcomeSchema = z.enum(["approved", "rejected"]);

export async function decideProfileChangeAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await requireActor();
    const outcome = OutcomeSchema.safeParse(formData.get("outcome"));
    if (!outcome.success) throw new ValidationError("Choose approve or reject.");
    await decideChange(actor, requiredUuid(formData, "changeId", "The change"), outcome.data, optionalText(formData, "note"));
    return outcome.data === "approved" ? "The change was approved and is now the city's profile." : "The change was rejected.";
  });
}

export async function installSampleEvidenceAction(jurisdictionId: string, _previous: ActionState, _formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await requireActor();
    const { created, existing } = await installSampleEvidence(actor, jurisdictionId);
    return `Sample evidence: ${formatCount(created.length, "dataset", "datasets")} installed, ${existing.length} already present.`;
  });
}
