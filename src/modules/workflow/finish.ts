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
import { applicableResolutionsOf } from "./phases";
import { contentSha256, loadSectionViews, type PhaseView } from "./sections";
import { detailsOf } from "./workflow";

// TechDesign/research-changes.md, "Finishing research" and "Cancel" (F22 R1, R6, R7, R8). One transaction,
// one lock: the decision row is held for the whole function, so an input write, a section change, a second
// finish, and a delete all wait, and the fingerprints and sections are read inside the lock. What is
// published is what the planner had adopted at that moment (R1, R8, R11).

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

    const views = await loadSectionViews(decisionId, facts, tx);
    const notReady = views.filter((v) => v.state.kind !== "ready");
    if (notReady.length > 0) throw new ValidationError(`Update ${listNames(notReady)} to the current analysis first.`); // R1

    const base = await getLatestReleasedSnapshot(tx, decisionId);
    const details = detailsOf(decision, usesSampleData);
    if (base) {
      const changes = summarizeChanges(views, base.snapshot, base.versionNumber, details);
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
      sections: views.map((view) => {
        if (view.state.kind !== "ready" || !view.output) throw new Error(`phase ${view.phase} is ready but has no output`);
        const content = view.state.content;
        const hash = contentSha256(content);
        const before = base?.snapshot.sections.find((s) => s.phase === view.phase);
        return {
          phase: view.phase,
          sectionVersionNumber: view.state.version?.versionNumber ?? null,
          contentSha256: hash,
          outputSha256: view.state.version?.outputSha256 ?? view.output.contentSha256,
          headline: content.headline,
          lines: content.lines,
          tables: content.tables,
          changed: before?.contentSha256 !== hash,
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
    const views = await loadSectionViews(decisionId, facts, tx);
    if (summarizeChanges(views, base.snapshot, base.versionNumber, detailsOf(decision, usesSampleData)).hasChanges) {
      throw new ConflictError("This research change has changes in it. Finish it, or change the inputs again.");
    }
    await restoreCompleted(tx, decisionId);
  });
}
