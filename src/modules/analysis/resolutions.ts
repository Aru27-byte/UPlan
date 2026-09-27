import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import type { Actor } from "@/modules/accounts";
import { getDecision, lockEditableDecision } from "@/modules/decisions";
import { db } from "@/platform/db";
import { ConflictError, ValidationError, isUniqueViolation } from "@/platform/errors";

import { getRun, readRunResults } from "./run";
import type { Disagreement } from "./results";
import { getAnalysisStatusInternal } from "./status";
import { evidenceResolution } from "./tables";

// TechDesign/evidence-review.md (F19). A resolution is a planner's recorded reasoning about one
// disagreement between two dataset versions. It is a NOTE: it is not an input to any computation, so it
// is not part of input_sha256, it doesn't trigger a run, and there is no code path from it to a number
// (R7). Both sources stay shown (F7 R3).

export type EvidenceResolution = typeof evidenceResolution.$inferSelect;

const SaveResolutionSchema = z.object({
  resourceType: z.string().min(1),
  mappedBy: z.uuid(),
  notMappedBy: z.uuid(),
  reliedOn: z.enum(["mapped_by", "not_mapped_by", "neither"]),
  rationale: z.string().trim().min(1, "Say why you rely on this source.").max(2000),
  expectedRevision: z.number().int().min(1),
});
export type SaveResolutionInput = z.input<typeof SaveResolutionSchema>;

export async function saveResolution(actor: Actor, decisionId: string, input: SaveResolutionInput): Promise<EvidenceResolution> {
  const parsed = SaveResolutionSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues.map((i) => i.message).join(" "));
  const { expectedRevision, ...pair } = parsed.data;

  try {
    return await db.transaction(async (tx) => {
      // R13 of decisions.md: only an in-progress decision can be changed, and the lock holds for the
      // rest of the transaction, so the check below and the insert see the same project.
      await lockEditableDecision(tx, actor, decisionId);

      const status = await getAnalysisStatusInternal(decisionId);
      if (status.kind !== "current") {
        throw new ValidationError("Wait for the analysis to finish before recording a resolution.");
      }
      const run = await getRun(status.runId);
      const results = run ? readRunResults(run) : null;
      if (!results) throw new ValidationError("The latest analysis is out of date. Wait for the new one to finish.");
      // R11: only a disagreement the current run actually reports can be resolved.
      const isReported = results.evidenceBase.disagreements.some(
        (d) => d.resourceType === pair.resourceType && d.mappedBy === pair.mappedBy && d.notMappedBy === pair.notMappedBy,
      );
      if (!isReported) throw new ValidationError("That disagreement isn't in the latest analysis. Reload the page.");

      const [row] = await tx
        .insert(evidenceResolution)
        .values({
          decisionId,
          resourceTypeKey: pair.resourceType,
          mappedBy: pair.mappedBy,
          notMappedBy: pair.notMappedBy,
          reliedOn: pair.reliedOn,
          rationale: pair.rationale,
          revision: expectedRevision,
          createdBy: actor.userId,
        })
        .returning();
      if (!row) throw new Error("insert into evidence_resolution unexpectedly returned no row");
      return row;
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ConflictError(`Revision ${expectedRevision} of this note already exists. Reload the page to see the latest.`); // R10
    }
    throw err;
  }
}

/** Every revision of every resolution for the decision, oldest first. */
export async function listResolutions(actor: Actor, decisionId: string): Promise<EvidenceResolution[]> {
  await getDecision(actor, decisionId); // ownership
  return listResolutionsInternal(decisionId);
}

/** System-authority read, for callers that have already authorized the decision. */
export async function listResolutionsInternal(decisionId: string): Promise<EvidenceResolution[]> {
  return db
    .select()
    .from(evidenceResolution)
    .where(eq(evidenceResolution.decisionId, decisionId))
    .orderBy(
      asc(evidenceResolution.resourceTypeKey),
      asc(evidenceResolution.mappedBy),
      asc(evidenceResolution.notMappedBy),
      asc(evidenceResolution.revision),
    );
}

const pairKey = (r: { resourceTypeKey: string; mappedBy: string; notMappedBy: string }) =>
  `${r.resourceTypeKey}:${r.mappedBy}:${r.notMappedBy}`;

/** R8: the highest revision of each resolution is the one shown; the earlier ones are its history. */
export function latestResolutions(all: EvidenceResolution[]): EvidenceResolution[] {
  const latest = new Map<string, EvidenceResolution>();
  for (const r of all) {
    const current = latest.get(pairKey(r));
    if (!current || r.revision > current.revision) latest.set(pairKey(r), r);
  }
  return [...latest.values()];
}

export type ResolutionMatch = {
  /** Each disagreement in the current run, with its latest resolution — or null: "not yet recorded for the current data" (R9). */
  disagreements: { disagreement: Disagreement; resolution: EvidenceResolution | null }[];
  /** Resolutions whose exact pair of dataset versions is no longer in the run: "recorded for earlier data" (R9). */
  recordedForEarlierData: EvidenceResolution[];
};

/**
 * R9: an exact match on (resource type, mapped-by version, not-mapped-by version). A resolution is never
 * carried across to different data, and no code compares versions loosely.
 */
export function matchResolutions(disagreements: Disagreement[], all: EvidenceResolution[]): ResolutionMatch {
  const latest = latestResolutions(all);
  const byPair = new Map(latest.map((r) => [pairKey(r), r]));
  const inRun = new Set(disagreements.map((d) => pairKey({ resourceTypeKey: d.resourceType, mappedBy: d.mappedBy, notMappedBy: d.notMappedBy })));
  return {
    disagreements: disagreements.map((d) => ({
      disagreement: d,
      resolution: byPair.get(pairKey({ resourceTypeKey: d.resourceType, mappedBy: d.mappedBy, notMappedBy: d.notMappedBy })) ?? null,
    })),
    recordedForEarlierData: latest.filter((r) => !inRun.has(pairKey(r))),
  };
}
