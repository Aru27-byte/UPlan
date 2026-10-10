import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import type { Actor } from "@/modules/accounts";
import { getDecision, lockEditableDecision } from "@/modules/decisions";
import { appUser } from "@/platform/auth-tables";
import { db } from "@/platform/db";
import { ValidationError } from "@/platform/errors";

import { reportSectionFeedback } from "./tables";

// TechDesign/research-phases.md, "Report-section feedback" (R15). A planner's note about the section of the
// final document a step feeds. Append-only, and never read back into an output: it can't change a figure or
// a sentence (R2).

export const FEEDBACK_STEPS = ["overview", "site", "evidence", "screening", "studies", "footprint", "impact"] as const;
export type FeedbackStep = (typeof FEEDBACK_STEPS)[number];

export type SectionFeedback = { id: string; step: FeedbackStep; note: string; by: string; at: Date };

const RecordFeedbackSchema = z.object({
  step: z.enum(FEEDBACK_STEPS),
  note: z.string().trim().min(1, "Write the feedback first.").max(2000, "Keep the feedback under 2,000 characters."),
});
export type RecordFeedbackInput = z.input<typeof RecordFeedbackSchema>;

export async function recordSectionFeedback(actor: Actor, decisionId: string, input: RecordFeedbackInput): Promise<void> {
  const parsed = RecordFeedbackSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues.map((i) => i.message).join(" "));
  await db.transaction(async (tx) => {
    // R15, R12: only an in-progress project takes feedback.
    await lockEditableDecision(tx, actor, decisionId);
    await tx.insert(reportSectionFeedback).values({
      decisionId,
      step: parsed.data.step,
      note: parsed.data.note,
      createdBy: actor.userId,
    });
  });
}

export async function listSectionFeedback(actor: Actor, decisionId: string, step: FeedbackStep): Promise<SectionFeedback[]> {
  await getDecision(actor, decisionId); // ownership
  return listSectionFeedbackInternal(decisionId, step);
}

/**
 * The same list without the ownership read, for a caller that authorizes the project itself in the same
 * breath (the step pages, which read the feedback alongside getWorkflow and render nothing unless that
 * succeeds) — so the two reads overlap instead of queueing, one fewer round trip on every step page.
 */
export async function listSectionFeedbackInternal(decisionId: string, step: FeedbackStep): Promise<SectionFeedback[]> {
  const rows = await db
    .select({
      id: reportSectionFeedback.id,
      step: reportSectionFeedback.step,
      note: reportSectionFeedback.note,
      createdAt: reportSectionFeedback.createdAt,
      by: appUser.name,
    })
    .from(reportSectionFeedback)
    .innerJoin(appUser, eq(appUser.id, reportSectionFeedback.createdBy))
    .where(and(eq(reportSectionFeedback.decisionId, decisionId), eq(reportSectionFeedback.step, step)))
    .orderBy(desc(reportSectionFeedback.createdAt), desc(reportSectionFeedback.id));
  return rows.map((r) => ({ id: r.id, step: z.enum(FEEDBACK_STEPS).parse(r.step), note: r.note, by: r.by, at: r.createdAt }));
}
