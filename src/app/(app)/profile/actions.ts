"use server";

import { z } from "zod";

import { requireActor } from "@/app/_lib/actor";
import { requiredText, requiredUuid, runAction } from "@/app/_lib/action-state";
import { installSampleEvidence } from "@/modules/evidence";
import { addUrlSource, applyUpload, editSettings, removeSource, updateSource } from "@/modules/profiles";
import { formatCount } from "@/modules/provenance";
import { ConflictError, ValidationError, isUniqueViolation } from "@/platform/errors";
import type { ActionState } from "@/ui/action-state";

// Server Functions for the city profile page. Each authenticates, reads its form, calls ONE module
// function, and returns a message. A change applies the moment it is saved (profile-upload-edit.md R5):
// there is no review step. Each form carries the profile revision its page showed, so a save made from a
// page that is out of date is refused instead of overwriting someone else's change.

const MAX_WORKBOOK_BYTES = 5 * 1024 * 1024;

/** The revision a form was built from: a version id, or blank when the page showed no profile yet. */
function baseVersionId(formData: FormData): string | null {
  const value = formData.get("baseVersionId");
  if (value === "") return null;
  return requiredUuid(formData, "baseVersionId", "The profile revision");
}

/** Every `prefix<key>` field in a form, as [key, value] pairs. */
function fieldsWithPrefix(formData: FormData, prefix: string): [string, string][] {
  const found: [string, string][] = [];
  for (const [name, value] of formData.entries()) {
    if (name.startsWith(prefix) && typeof value === "string") found.push([name.slice(prefix.length), value]);
  }
  return found;
}

function fieldFor(fields: [string, string][], key: string, label: string): string {
  const found = fields.find(([k]) => k === key);
  if (!found) throw new ValidationError(`${label} is missing for "${key}". Reload the page and try again.`);
  return found[1];
}

const VestingChoiceSchema = z.enum(["vest", "current"]);

export async function saveSettingsAction(jurisdictionId: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await requireActor();

    const vesting = fieldsWithPrefix(formData, "vesting:").map(([ruleSet, choice]) => {
      const parsed = VestingChoiceSchema.safeParse(choice);
      if (!parsed.success) throw new ValidationError("Choose whether each rule set vests to the filing date.");
      return { ruleSet, vests: parsed.data === "vest" };
    });
    const retainYears = fieldsWithPrefix(formData, "retainYears:");
    const countFrom = fieldsWithPrefix(formData, "countFrom:");
    const retention = retainYears.map(([recordType, years]) => ({
      recordType,
      retainYears: years.trim() === "" ? Number.NaN : Number(years),
      countFrom: fieldFor(countFrom, recordType, "The retention start"),
    }));
    const exportFormats = formData.getAll("exportFormats").filter((v): v is string => typeof v === "string");

    await editSettings(actor, jurisdictionId, baseVersionId(formData), {
      vesting,
      retention,
      exportFormats,
      mapStatus: Object.fromEntries(fieldsWithPrefix(formData, "mapStatus:")),
    });
    return "Settings saved. Open projects are being re-analyzed under them.";
  });
}

export async function addUrlSourceAction(jurisdictionId: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await requireActor();
    await addUrlSource(actor, jurisdictionId, {
      label: requiredText(formData, "label", "A name for the source"),
      url: requiredText(formData, "url", "A web address"),
    });
    return "Source added.";
  });
}

function requireWorkbook(formData: FormData): File {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new ValidationError("Choose a workbook (.xlsx) to upload.");
  if (!/\.xlsx$/i.test(file.name)) throw new ValidationError("Upload an Excel workbook (.xlsx). Download the template for the layout.");
  if (file.size > MAX_WORKBOOK_BYTES) throw new ValidationError("That file is larger than 5 MB.");
  return file;
}

async function applyWorkbook(jurisdictionId: string, formData: FormData, sourceId: string | null): Promise<string> {
  const { actor } = await requireActor();
  const file = requireWorkbook(formData);
  const label = requiredText(formData, "label", "A name for the source");

  let result: Awaited<ReturnType<typeof applyUpload>>;
  try {
    result = await applyUpload(actor, jurisdictionId, baseVersionId(formData), Buffer.from(await file.arrayBuffer()), { sourceId, label });
  } catch (err) {
    // profile_upload is unique on (city, file hash): the same workbook can't be uploaded twice.
    if (isUniqueViolation(err)) throw new ConflictError("This exact workbook was already uploaded. Change it, or add a different one.");
    throw err;
  }
  if (result.versionNumber === null) {
    throw new ValidationError(`The workbook can't be used. ${result.upload.validationErrors.join(" ")}`);
  }
  return `Workbook applied as profile version ${result.versionNumber}. Open projects are being re-analyzed under it.`;
}

export async function addExcelSourceAction(jurisdictionId: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(() => applyWorkbook(jurisdictionId, formData, null));
}

export async function updateSourceAction(jurisdictionId: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireActor();
    const sourceId = requiredUuid(formData, "sourceId", "The source");
    // A workbook in the form replaces the one behind an Excel source and applies its rules; otherwise this renames
    // the source and, for a web source, changes its address.
    const file = formData.get("file");
    if (file instanceof File && file.size > 0) return applyWorkbook(jurisdictionId, formData, sourceId);
    const url = formData.get("url");
    await updateSource(jurisdictionId, sourceId, {
      label: requiredText(formData, "label", "A name for the source"),
      url: typeof url === "string" ? url : null,
    });
    return "Source updated.";
  });
}

export async function removeSourceAction(jurisdictionId: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireActor();
    await removeSource(jurisdictionId, requiredUuid(formData, "sourceId", "The source"));
    return "Source removed. The rules it supplied stay in the profile.";
  });
}

export async function installSampleEvidenceAction(jurisdictionId: string, _previous: ActionState, _formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await requireActor();
    const { created, existing } = await installSampleEvidence(actor, jurisdictionId);
    return `Sample evidence: ${formatCount(created.length, "dataset", "datasets")} installed, ${existing.length} already present.`;
  });
}
