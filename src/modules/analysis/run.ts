import { createHash } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { getDecisionForAnalysis, getLatestGeometryInternal } from "@/modules/decisions";
import { getJurisdictionDatasetMappings } from "@/modules/evidence";
import {
  getCurrentProfileForAnalysis,
  getJurisdictionForAnalysis,
  getProfileChange,
  resolveRulesInForce,
  ProfileDocumentSchema,
} from "@/modules/profiles";
import { db, type DbOrTx } from "@/platform/db";

import { buildEvidenceBase, collectLimits } from "./evidence-base";
import { computeImpacts } from "./impact";
import { orderResults, type AnalysisResults } from "./results";
import { analysisRun, analysisRunDataset } from "./tables";

// TechDesign/evidence-base.md — the run_analysis job body (J2), shared by F7 and F9. Every run
// pins its inputs once, before computing anything, and never re-reads "current" mid-computation
// (.claude/rules/conventions.md: "Never read 'current' twice within one computation").

function canonicalJson(value: unknown): string {
  // Deterministic key order, independent of insertion order or locale (R8 of evidence-base.md).
  // The replacer's parameter is explicitly `unknown`, not the `any` JSON.stringify's own lib type
  // would otherwise infer, so the ternary's return type stays safely `unknown` throughout.
  return JSON.stringify(value, (_key: string, v: unknown) =>
    v !== null && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        )
      : v,
  );
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Today's date in the jurisdiction's own time zone (conventions.md: "Timestamps are stored in UTC
 * and displayed in the jurisdiction's time_zone"; system-architecture.md's rules-in-force section:
 * "the rules in force today, in the city's time zone"). `clock` is a seam so tests inject a fixed
 * instant instead of the real one.
 */
function todayInZone(timeZone: string, clock: () => Date = () => new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(clock());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export async function runAnalysis(
  decisionId: string,
  purpose: "current" | "preview",
  profileChangeId?: string,
): Promise<void> {
  const decision = await getDecisionForAnalysis(decisionId);
  const studyArea = await getLatestGeometryInternal(decisionId, "study_area");
  if (!studyArea) return; // nothing to analyze yet — the job simply has nothing to do

  const footprint = await getLatestGeometryInternal(decisionId, "footprint"); // null: evidence base only

  const jurisdictionRow = await getJurisdictionForAnalysis(decision.jurisdictionId);
  const currentProfile = await getCurrentProfileForAnalysis(decision.jurisdictionId);
  const change = purpose === "preview" && profileChangeId ? await getProfileChange(profileChangeId) : null;
  const rawDocument = change ? change.proposedDocument : currentProfile?.document;
  if (!rawDocument) return; // no approved profile yet — nothing to analyze against
  // Re-validate rather than `as`-cast: this is untyped jsonb read back from the database
  // (conventions.md: "no `as` casts on data from outside the process"), even though it was
  // validated once already before being stored.
  const profileDocument = ProfileDocumentSchema.parse(rawDocument);

  const { resolvedFor, rules } = resolveRulesInForce(
    profileDocument,
    todayInZone(jurisdictionRow.timeZone),
    decision.applicationFiledOn,
  );
  const mappings = await getJurisdictionDatasetMappings(decision.jurisdictionId);
  const pinnedVersionIds = [
    ...new Set(mappings.map((m) => m.dataset.currentVersionId).filter((id): id is string => id !== null)),
  ].sort();

  const inputSha256 = sha256(
    canonicalJson({
      studyAreaRevision: studyArea.revision,
      footprintRevision: footprint?.revision ?? null,
      profileVersionId: purpose === "current" ? (currentProfile?.id ?? null) : null,
      profileChangeId: purpose === "preview" ? profileChangeId : null,
      resolvedFor,
      pinnedVersionIds,
    }),
  );

  const existing = await db
    .select({ id: analysisRun.id })
    .from(analysisRun)
    .where(
      and(
        eq(analysisRun.decisionId, decisionId),
        eq(analysisRun.purpose, purpose),
        eq(analysisRun.inputSha256, inputSha256),
      ),
    );
  if (existing.length > 0) return; // R8: identical pinned inputs never recompute

  const [run] = await db
    .insert(analysisRun)
    .values({
      decisionId,
      purpose,
      profileVersionId: purpose === "current" ? (currentProfile?.id ?? null) : null,
      profileChangeId: purpose === "preview" ? (profileChangeId ?? null) : null,
      rulesResolvedFor: resolvedFor,
      studyAreaRevision: studyArea.revision,
      footprintRevision: footprint?.revision ?? null,
      inputSha256,
      status: "running",
    })
    .returning();
  if (!run) throw new Error("insert into analysis_run unexpectedly returned no row");

  if (pinnedVersionIds.length > 0) {
    await db
      .insert(analysisRunDataset)
      .values(pinnedVersionIds.map((id) => ({ analysisRunId: run.id, datasetVersionId: id })));
  }

  try {
    const analysisSrid = jurisdictionRow.analysisSrid; // e.g. 2926 for Sammamish (tech-stack.md)
    const evidenceBase = await buildEvidenceBase(rules.resourceTypes, mappings, studyArea.geom, analysisSrid);
    const impacts = footprint
      ? await computeImpacts(rules.resourceTypes, rules.bufferRules, mappings, footprint.geom, analysisSrid)
      : [];
    const results: AnalysisResults = orderResults({
      impacts,
      evidenceBase,
      limits: collectLimits(mappings, rules.resourceTypes),
    });

    await db
      .update(analysisRun)
      .set({ status: "succeeded", results, finishedAt: new Date() })
      .where(and(eq(analysisRun.id, run.id), eq(analysisRun.status, "running")));
  } catch (err) {
    await db
      .update(analysisRun)
      .set({
        status: "failed",
        errorDetail: err instanceof Error ? err.message : String(err),
        finishedAt: new Date(),
      })
      .where(and(eq(analysisRun.id, run.id), eq(analysisRun.status, "running")));
    throw err;
  }
}

export async function getRun(runId: string) {
  const [row] = await db.select().from(analysisRun).where(eq(analysisRun.id, runId));
  return row ?? null;
}

export async function getLatestRun(decisionId: string, purpose: "current" | "preview", tx: DbOrTx = db) {
  const rows = await tx
    .select()
    .from(analysisRun)
    .where(
      and(
        eq(analysisRun.decisionId, decisionId),
        eq(analysisRun.purpose, purpose),
        eq(analysisRun.status, "succeeded"),
      ),
    )
    .orderBy(analysisRun.startedAt);
  return rows.at(-1) ?? null;
}
