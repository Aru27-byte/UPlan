"use server";

import { z } from "zod";

import { requireActor } from "@/app/_lib/actor";
import { optionalText, requiredUuid, runAction } from "@/app/_lib/action-state";
import { respondToSuggestion } from "@/modules/assist";
import { ValidationError } from "@/platform/errors";
import type { ActionState } from "@/ui/action-state";

// The one Server Function a suggestion's card shares between a project's phase pages and the city profile page
// (F24 R14): dismiss it, or mark it helpful or not helpful, with an optional note. The module checks that the
// person can reach the suggestion, so the page needs no other guard.
const ResponseSchema = z.enum(["helpful", "not-helpful", "dismissed"]);

export async function respondAssistAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await requireActor();
    const response = ResponseSchema.safeParse(formData.get("response"));
    if (!response.success) throw new ValidationError("This form is out of date. Reload the page and try again.");
    await respondToSuggestion(actor, requiredUuid(formData, "suggestionId", "The suggestion"), response.data, optionalText(formData, "note"));
    return "Your response was recorded.";
  });
}
