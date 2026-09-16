import { redirect } from "next/navigation";
import { z } from "zod";

import { createDecision } from "@/modules/decisions";
import { ValidationError } from "@/platform/errors";

import { requireActor } from "@/app/_lib/actor";
import { buttonClassName } from "@/ui/button-styles";

// Every boundary is validated with Zod, including form data (.claude/rules/conventions.md) — this
// also replaces an unchecked `as` cast on submitted input with a real, rejecting validation.
const NewDecisionFormSchema = z.object({
  jurisdictionId: z.string().min(1),
  title: z.string().min(1),
  applicationType: z.enum(["subdivision", "short_subdivision", "clearing_grading"]),
});

// W3 of system-architecture.md: create a decision under a jurisdiction. Thin: authenticate,
// validate, call one module function (decisions.createDecision), return the result.
async function createDecisionAction(formData: FormData) {
  "use server";
  const { actor } = await requireActor();
  const parsed = NewDecisionFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
  const decision = await createDecision(actor, parsed.data);
  redirect(`/decisions/${decision.id}/map`);
}

export default async function NewDecisionPage() {
  const { actor } = await requireActor(); // ensures a signed-in, known actor before rendering the form; see decisions.md R1
  const firstMembership = actor.memberships[0];

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-bold">New project</h1>
      <form action={createDecisionAction} className="card-sticker flex flex-col gap-4 bg-white p-6">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Jurisdiction ID
          <input
            name="jurisdictionId"
            required
            defaultValue={firstMembership?.jurisdictionId}
            className="rounded-md border border-ink/30 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Title
          <input name="title" required className="rounded-md border border-ink/30 px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Application type
          <select name="applicationType" required className="rounded-md border border-ink/30 px-3 py-2">
            <option value="subdivision">Subdivision</option>
            <option value="short_subdivision">Short subdivision</option>
            <option value="clearing_grading">Clearing and grading</option>
          </select>
        </label>
        <button type="submit" className={buttonClassName("primary", "text-ink")}>
          Create decision
        </button>
      </form>
    </div>
  );
}
