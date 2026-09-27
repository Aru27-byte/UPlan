import { refresh } from "next/cache";
import { z } from "zod";

import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/platform/errors";
import type { ActionState } from "@/ui/action-state";

// TechDesign/project-dashboard.md, "Server Function pattern". A Server Function is a boundary: this is
// where the four expected error classes become a message the person can act on, and where success
// re-renders the current page. Everything else — including `redirect()`, which works by throwing — is not
// caught here and propagates (conventions.md: "Catch only at a boundary… and rethrow anything you can't
// handle"). Not a "use server" file: those may only export async functions, and this is imported by them.
export async function runAction(perform: () => Promise<string | void>): Promise<ActionState> {
  let notice: string | void;
  try {
    notice = await perform();
  } catch (err) {
    if (
      err instanceof ValidationError ||
      err instanceof ConflictError ||
      err instanceof ForbiddenError ||
      err instanceof NotFoundError
    ) {
      return { error: err.message };
    }
    throw err;
  }
  refresh(); // the page re-renders from its records; nothing is cached (do-not.md)
  return notice ? { notice } : {};
}

/** A required text field from a form, or a ValidationError naming it. */
export function requiredText(formData: FormData, name: string, label: string): string {
  const value = formData.get(name);
  if (typeof value !== "string" || value.trim().length === 0) throw new ValidationError(`${label} is required.`);
  return value;
}

/** An id from a hidden field: a UUID, or a ValidationError, so a malformed one never reaches the database. */
export function requiredUuid(formData: FormData, name: string, label: string): string {
  const value = requiredText(formData, name, label);
  if (!z.uuid().safeParse(value).success) throw new ValidationError("This page is out of date. Reload it and try again.");
  return value;
}

/** An optional text field: null when absent or blank. */
export function optionalText(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/** A whole number from a hidden field (a row version or a revision), or a ValidationError. */
export function requiredInt(formData: FormData, name: string): number {
  const raw = formData.get(name);
  // Number(null) is 0 and Number("") is 0, so a missing or blank field must be refused before converting.
  const value = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : Number.NaN;
  if (!Number.isInteger(value)) throw new ValidationError("This page is out of date. Reload it and try again.");
  return value;
}
