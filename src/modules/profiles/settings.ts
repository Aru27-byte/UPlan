import { z } from "zod";

import { ValidationError } from "@/platform/errors";

import { ProfileDocumentSchema, SettingsSchema, type ProfileDocument } from "./schema";

// What the profile page's settings panel submits: the three kinds of setting a planner chooses (charter,
// "Settings planners choose"). Map status lives on each resource type in the document, not in `settings`, so it
// travels here beside them, keyed by resource type.
export const SettingsEditSchema = SettingsSchema.extend({
  mapStatus: z.record(z.string(), z.enum(["regulatory", "approximate"])),
});
export type SettingsEdit = z.infer<typeof SettingsEditSchema>;

/**
 * The document with the edit applied. Every resource type must be given a map status and none may be invented:
 * a missing or unknown key means the panel was built from an out-of-date profile, which is refused rather than
 * patched. The result passes the same schema as an upload (jurisdiction-profile.md R8).
 */
export function applySettingsEdit(document: ProfileDocument, edit: SettingsEdit): ProfileDocument {
  const known = new Set(document.resourceTypes.map((r) => r.key));
  const given = Object.keys(edit.mapStatus);
  const unknown = given.filter((k) => !known.has(k));
  const missing = [...known].filter((k) => !(k in edit.mapStatus));
  if (unknown.length > 0 || missing.length > 0) {
    throw new ValidationError("The profile changed since this panel opened. Reload the page and try again.");
  }

  const result = ProfileDocumentSchema.safeParse({
    ...document,
    resourceTypes: document.resourceTypes.map((r) => ({ ...r, mapStatus: edit.mapStatus[r.key] })),
    settings: { vesting: edit.vesting, retention: edit.retention, exportFormats: edit.exportFormats },
  });
  if (!result.success) throw new ValidationError(result.error.issues.map((i) => i.message).join(" "));
  return result.data;
}
