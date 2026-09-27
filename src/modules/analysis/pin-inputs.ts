import { createHash } from "node:crypto";

import {
  getDecisionForAnalysis,
  getLatestGeometryInternal,
  type Decision,
  type DecisionGeometry,
} from "@/modules/decisions";
import { getJurisdictionDatasetMappings, type JurisdictionDatasetMapping } from "@/modules/evidence";
import {
  ProfileDocumentSchema,
  getCurrentProfile,
  getJurisdiction,
  getProfileChange,
  resolveRulesInForce,
  type InForceRules,
  type RuleSet,
} from "@/modules/profiles";

import { RESULTS_VERSION } from "./results";

// TechDesign/decision-overview.md, "One read of the inputs" (R7). The one place a run's inputs are
// read and hashed. run.ts calls it to compute, and status.ts calls it to say whether a run for the
// CURRENT inputs exists, so a page and a run can't disagree about what "current" was. It reads every
// input once and never re-reads "current" (conventions.md: "Never read 'current' twice within one
// computation"): everything below is what the run computes from.

export type Clock = () => Date;

export type PinnedInputs = {
  decision: Decision;
  jurisdiction: { id: string; analysisSrid: number; timeZone: string };
  purpose: "current" | "preview";
  profileVersionId: string | null; // set for "current"
  profileChangeId: string | null; // set for "preview"
  studyArea: DecisionGeometry;
  footprint: DecisionGeometry | null;
  resolvedFor: Record<RuleSet, string>; // the date each rule set was resolved for: stored on the run, shown to the planner
  rules: InForceRules;
  inForceRuleKeys: string[]; // sorted; this, not the date, is what the hash carries
  mappings: JurisdictionDatasetMapping[];
  datasetVersionIds: string[]; // sorted
  resultsVersion: number;
  inputSha256: string;
};

// A run needs a study area and an approved profile. Lacking either is a stated reason, not an error
// and not a silent return: the status page says which.
export type PinResult =
  | { kind: "no-study-area" }
  | { kind: "no-profile" }
  | { kind: "ready"; pinned: PinnedInputs };

/**
 * Deterministic key order, independent of insertion order or locale (R8 of evidence-base.md). The one
 * canonical JSON: run.ts's input hash and workflow's phase fingerprints both use it.
 */
export function canonicalJson(value: unknown): string {
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

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Today's date in the jurisdiction's own time zone (conventions.md: "Timestamps are stored in UTC and
 * displayed in the jurisdiction's time_zone"; "Domain logic takes today's date from an injected clock").
 */
export function todayInZone(timeZone: string, clock: Clock): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(clock());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function ruleKeysOf(rules: InForceRules): string[] {
  return [
    ...rules.bufferRules.map((r) => `buffer:${r.key}:${r.effectiveOn}`),
    ...rules.studyTriggers.map((r) => `trigger:${r.key}:${r.effectiveOn}`),
    ...rules.treeRules.map((r) => `tree:${r.key}:${r.effectiveOn}`),
  ].sort();
}

export async function pinInputs(
  decisionId: string,
  purpose: "current" | "preview",
  profileChangeId?: string,
  clock: Clock = () => new Date(),
): Promise<PinResult> {
  const decision = await getDecisionForAnalysis(decisionId);
  const studyArea = await getLatestGeometryInternal(decisionId, "study_area");
  if (!studyArea) return { kind: "no-study-area" };
  const footprint = await getLatestGeometryInternal(decisionId, "footprint"); // null: evidence base and screening only

  const jurisdiction = await getJurisdiction(decision.jurisdictionId);
  let document: unknown;
  let profileVersionId: string | null = null;
  if (purpose === "preview") {
    if (!profileChangeId) throw new Error("a preview run needs the profile change it previews");
    document = (await getProfileChange(profileChangeId)).proposedDocument;
  } else {
    const current = await getCurrentProfile(decision.jurisdictionId);
    if (!current) return { kind: "no-profile" };
    document = current.document;
    profileVersionId = current.id;
  }
  // Re-validate rather than `as`-cast: untyped jsonb read back from the database (conventions.md),
  // even though it was validated once before it was stored.
  const profileDocument = ProfileDocumentSchema.parse(document);

  // Throws ValidationError when a vesting rule set has no filing date: the same message the planner
  // sees on the Overview, and no default date stands in for the missing one (F1 R3).
  const { resolvedFor, rules } = resolveRulesInForce(
    profileDocument,
    todayInZone(jurisdiction.timeZone, clock),
    decision.applicationFiledOn,
  );
  const mappings = await getJurisdictionDatasetMappings(decision.jurisdictionId);
  const datasetVersionIds = [
    ...new Set(mappings.map((m) => m.dataset.currentVersionId).filter((id): id is string => id !== null)),
  ].sort();
  const inForceRuleKeys = ruleKeysOf(rules);

  const inputSha256 = sha256(
    canonicalJson({
      resultsVersion: RESULTS_VERSION,
      studyAreaRevision: studyArea.revision,
      footprintRevision: footprint?.revision ?? null,
      profileVersionId,
      profileChangeId: purpose === "preview" ? (profileChangeId ?? null) : null,
      inForceRuleKeys,
      datasetVersionIds,
    }),
  );

  return {
    kind: "ready",
    pinned: {
      decision,
      jurisdiction: { id: jurisdiction.id, analysisSrid: jurisdiction.analysisSrid, timeZone: jurisdiction.timeZone },
      purpose,
      profileVersionId,
      profileChangeId: purpose === "preview" ? (profileChangeId ?? null) : null,
      studyArea,
      footprint,
      resolvedFor,
      rules,
      inForceRuleKeys,
      mappings,
      datasetVersionIds,
      resultsVersion: RESULTS_VERSION,
      inputSha256,
    },
  };
}
