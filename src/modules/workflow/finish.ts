import { z } from "zod";

import type { Actor } from "@/modules/accounts";
import { beginFinish, lockEditableDecision, restoreCompleted } from "@/modules/decisions";
import {
  ReportSnapshotSchema,
  getLatestReleasedSnapshot,
  requestFinalDocument,
  CURRENT_TEMPLATE_VERSION,
  type ReportSnapshot,
} from "@/modules/reports";
import { db } from "@/platform/db";
import { ConflictError, ValidationError } from "@/platform/errors";

import { detailsDiffer, summarizeChanges } from "./changes";
import { loadPhaseFacts } from "./facts";
import { applicableResolutionsOf, buildPhaseViews, type PhaseView } from "./phases";
import { listReviewsInternal } from "./reviews";
import { detailsOf } from "./workflow";

// TechDesign/research-changes.md, "Finishing research" and "Cancel" (F22 R1, R6, R7, R8). One transaction,
// one lock: the decision row is held for the whole function, so an input write, a review, a second finish,
// and a delete all wait, and the fingerprints and reviews are read inside the lock. What is published is
// what was reviewed (R1, R8, R11).

const FinishInputSchema = z.object({
  changeNote: z
    .string()
    .trim()
    .max(1000, "Keep the reason under 1,000 characters.")
    .transform((n) => (n === "" ? null : n))
    .nullable(),
  expectedRowVersion: z.number().int().positive(),
});
export type FinishInput = z.input<typeof FinishInputSchema>;

const PHASE_NAME: Record<PhaseView["phase"], string> = {
  site: "Site",
  evidence: "Evidence",
  screening: "Screening",
  studies: "Studies",
  footprint: "Footprint",
  impact: "Impact",
};

const listNames = (views: PhaseView[]): string => {
  const names = views.map((v) => PHASE_NAME[v.phase]);
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
};

export async function finishResearch(actor: Actor, decisionId: string, input: FinishInput): Promise<{ reportId: string }> {
  const parsed = FinishInputSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues.map((i) => i.message).join(" "));
  const { changeNote, expectedRowVersion } = parsed.data;

  return db.transaction(async (tx) => {
    const decision = await lockEditableDecision(tx, actor, decisionId);
    if (decision.rowVersion !== expectedRowVersion) {
      throw new ConflictError("This project changed since you loaded the page. Reload it and check again.");
    }

    const { facts, usesSampleData } = await loadPhaseFacts(decision);
    if (facts.status.kind === "blocked") throw new ValidationError(facts.status.reason);
    if (facts.status.kind === "failed") throw new ValidationError("The analysis failed. Fix the cause or change an input, then try again.");
    if (facts.status.kind !== "current" || !facts.run) {
      throw new ValidationError("The analysis for the current inputs hasn't finished. Try again when it has.");
    }

    const reviews = await listReviewsInternal(decisionId);
    const views = buildPhaseViews(facts, reviews);
    const notReviewed = views.filter((v) => v.state.kind !== "reviewed");
    if (notReviewed.length > 0) throw new ValidationError(`Review ${listNames(notReviewed)} first.`); // R1

    const base = await getLatestReleasedSnapshot(tx, decisionId);
    const details = detailsOf(decision, usesSampleData);
    if (base) {
      const changes = summarizeChanges(views, base, details);
      if (!changes.hasChanges) {
        throw new ConflictError(`Nothing has changed since version ${base.versionNumber}. Cancel the research change instead.`); // R6
      }
      if (changeNote === null) throw new ValidationError("Give a short reason for this version."); // R6
    }

    const snapshot: ReportSnapshot = ReportSnapshotSchema.parse({
      templateVersion: CURRENT_TEMPLATE_VERSION,
      details,
      runId: facts.run.id,
      profileVersionId: facts.run.profileVersionId,
      phases: views.map((view) => {
        const review = view.state.kind === "reviewed" ? view.state.review : null;
        if (!review || !view.output) throw new Error(`phase ${view.phase} is reviewed but has no review or output`);
        const before = base?.snapshot.phases.find((p) => p.phase === view.phase);
        return {
          phase: view.phase,
          contentSha256: view.output.contentSha256,
          verdict: "reviewed",
          note: review.note,
          reviewedAt: review.reviewedAt.toISOString(),
          reviewedByName: review.reviewedByName,
          changed: !before || before.contentSha256 !== view.output.contentSha256,
          summary: { templateVersion: review.summary.templateVersion, headline: view.output.headline, lines: view.output.lines },
        };
      }),
      resolutions: applicableResolutionsOf(facts.run.results, facts.resolutions).map((r) => ({
        resourceType: r.resourceTypeKey,
        mappedBy: r.mappedBy,
        notMappedBy: r.notMappedBy,
        revision: r.revision,
      })),
      previousVersion: base?.versionNumber ?? null,
      detailsChanged: base ? detailsDiffer(base.snapshot.details, details) : false,
    });

    await beginFinish(tx, decisionId); // in_progress -> finishing: exactly one caller gets through (R8)
    return requestFinalDocument(tx, { decisionId, actor, runId: facts.run.id, snapshot, changeNote });
  });
}

/**
 * R7: a research change that changed nothing can be cancelled, returning the project to completed with its
 * last version as the current one. One that changed something can't: the new inputs are already recorded.
 */
export async function cancelResearchChange(actor: Actor, decisionId: string, expectedRowVersion: number): Promise<void> {
  await db.transaction(async (tx) => {
    const decision = await lockEditableDecision(tx, actor, decisionId);
    if (decision.rowVersion !== expectedRowVersion) {
      throw new ConflictError("This project changed since you loaded the page. Reload it and check again.");
    }
    const base = await getLatestReleasedSnapshot(tx, decisionId);
    if (!base) throw new ValidationError("There is no published version to return to.");

    const { facts, usesSampleData } = await loadPhaseFacts(decision);
    const views = buildPhaseViews(facts, await listReviewsInternal(decisionId));
    if (summarizeChanges(views, base, detailsOf(decision, usesSampleData)).hasChanges) {
      throw new ConflictError("This research change has changes in it. Finish it, or change the inputs again.");
    }
    await restoreCompleted(tx, decisionId);
  });
}
