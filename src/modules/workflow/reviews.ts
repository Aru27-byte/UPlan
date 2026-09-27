import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import type { Actor } from "@/modules/accounts";
import { getDecision, lockEditableDecision } from "@/modules/decisions";
import { appUser } from "@/platform/auth-tables";
import { db } from "@/platform/db";
import { ConflictError, ValidationError } from "@/platform/errors";

import { TEMPLATE_VERSION } from "./drafting";
import { loadPhaseFacts } from "./facts";
import { PHASES, derivePhaseOutputs, type PhaseReview } from "./phases";
import { phaseReview } from "./tables";

// TechDesign/research-phases.md, "Reviews" (R5–R8, R12). A review is the planner's own record that they
// read one phase's exact output. It is not sign-off (F12), not approval, and not a statement about the
// development. Append-only: changing a mind records a new review.

const SummarySchema = z.object({
  templateVersion: z.number().int().positive(),
  headline: z.string(),
  lines: z.array(z.string()),
});

export async function listReviewsInternal(decisionId: string): Promise<PhaseReview[]> {
  const rows = await db
    .select({
      id: phaseReview.id,
      phase: phaseReview.phase,
      contentSha256: phaseReview.contentSha256,
      verdict: phaseReview.verdict,
      note: phaseReview.note,
      summary: phaseReview.summary,
      reviewedAt: phaseReview.reviewedAt,
      reviewedByName: appUser.name,
    })
    .from(phaseReview)
    .innerJoin(appUser, eq(appUser.id, phaseReview.reviewedBy))
    .where(eq(phaseReview.decisionId, decisionId))
    .orderBy(asc(phaseReview.reviewedAt), asc(phaseReview.id));
  return rows.map((r) => ({
    id: r.id,
    phase: z.enum(PHASES).parse(r.phase),
    contentSha256: r.contentSha256,
    verdict: z.enum(["reviewed", "revision_requested"]).parse(r.verdict),
    note: r.note,
    summary: SummarySchema.parse(r.summary), // untyped jsonb: parsed, never `as`-cast
    reviewedByName: r.reviewedByName,
    reviewedAt: r.reviewedAt,
  }));
}

export async function listReviews(actor: Actor, decisionId: string): Promise<PhaseReview[]> {
  await getDecision(actor, decisionId); // ownership
  return listReviewsInternal(decisionId);
}

const RecordReviewSchema = z.object({
  phase: z.enum(PHASES),
  verdict: z.enum(["reviewed", "revision_requested"]),
  note: z
    .string()
    .trim()
    .max(2000, "Keep the note under 2,000 characters.")
    .transform((n) => (n === "" ? null : n))
    .nullable(),
  expectedContentSha256: z.string().regex(/^[0-9a-f]{64}$/, "Reload the page and try again."),
});
export type RecordReviewInput = z.input<typeof RecordReviewSchema>;

export async function recordReview(actor: Actor, decisionId: string, input: RecordReviewInput): Promise<PhaseReview> {
  const parsed = RecordReviewSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues.map((i) => i.message).join(" "));
  const { phase, verdict, note, expectedContentSha256 } = parsed.data;
  if (verdict === "revision_requested" && note === null) throw new ValidationError("Say what needs work."); // R6

  const id = await db.transaction(async (tx) => {
    // R12: only an in-progress decision can be reviewed. The lock also serializes this review against
    // every input change and against finishing, so the fingerprint checked below is still the output when
    // the row is inserted (R7).
    const decision = await lockEditableDecision(tx, actor, decisionId);
    const { facts } = await loadPhaseFacts(decision);
    const output = derivePhaseOutputs(facts)[phase];
    if (!output) throw new ValidationError(`There is no ${phase} output to review yet.`); // R4
    if (output.contentSha256 !== expectedContentSha256) {
      throw new ConflictError("This output changed while you were reading it. Reload the page and review the new output."); // R7
    }
    const [row] = await tx
      .insert(phaseReview)
      .values({
        decisionId,
        phase,
        contentSha256: output.contentSha256,
        verdict,
        note,
        summary: { templateVersion: TEMPLATE_VERSION, headline: output.headline, lines: output.lines },
        reviewedBy: actor.userId,
      })
      .returning({ id: phaseReview.id });
    if (!row) throw new Error("insert into phase_review unexpectedly returned no row");
    return row.id;
  });

  const recorded = (await listReviewsInternal(decisionId)).find((r) => r.id === id);
  if (!recorded) throw new Error(`review ${id} could not be read back`);
  return recorded;
}
