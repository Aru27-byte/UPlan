import { ApplicationTypeSchema, type ApplicationType } from "@/modules/decisions";

export const APPLICATION_TYPE_LABEL: Record<ApplicationType, string> = {
  subdivision: "Subdivision",
  short_subdivision: "Short subdivision",
  clearing_grading: "Clearing and grading",
};

/**
 * The words for a stored application type. The column is plain text and the check constraint is the
 * guarantee, so an unknown value is a bug to surface, never one to display as-is or replace with a default.
 */
export function applicationTypeLabel(stored: string): string {
  return APPLICATION_TYPE_LABEL[ApplicationTypeSchema.parse(stored)];
}

/** The word a page shows for a value that isn't recorded — never a blank and never a placeholder value (F5 R10). */
export const NOT_RECORDED = "Not yet recorded";
