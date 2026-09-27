import {
  canonicalJson,
  matchResolutions,
  sha256,
  type AnalysisResults,
  type AnalysisStatus,
  type EvidenceResolution,
} from "@/modules/analysis";
import type { GeometrySummary } from "@/modules/decisions";
import type { InForceRules } from "@/modules/profiles";

import { diffLines, type LineDiff } from "./diff";
import {
  draftEvidence,
  draftFootprint,
  draftImpact,
  draftScreening,
  draftSite,
  draftStudies,
  type Draft,
  type DraftContext,
} from "./drafting";

// TechDesign/research-phases.md. A phase's output is not stored: it is a pure function of records that
// are already immutable — a geometry revision, a finished analysis run, and the append-only resolution
// notes. This file derives all six outputs from those facts and fingerprints each; what IS stored is the
// planner's response, one append-only phase_review row per review, bound to the fingerprint it was made on.

export const PHASES = ["site", "evidence", "screening", "studies", "footprint", "impact"] as const;
export type PhaseKey = (typeof PHASES)[number];

export type PhaseOutput = {
  phase: PhaseKey;
  contentSha256: string; // R7: the fingerprint a review is bound to
  headline: string;
  lines: string[];
  inputs: { label: string; value: string }[]; // R1: what this was drafted from
};

export type PhaseFacts = {
  studyArea: GeometrySummary | null;
  footprint: GeometrySummary | null;
  status: AnalysisStatus;
  // Present only when status.kind === "current" (R4): the run for the CURRENT inputs.
  run: {
    id: string;
    results: AnalysisResults;
    profileVersionId: string;
    profileVersionNumber: number;
    datasetVersionIds: string[];
  } | null;
  rules: InForceRules | null; // the rules the pinned inputs resolved, for labels, named studies, and the Overview
  resolvedFor: Record<string, string> | null; // the date each rule set was resolved for (F18 R9)
  datasetTitles: Map<string, string>; // by dataset version id, for the versions the run pinned
  datasetLimitations: Map<string, string>;
  resolutions: EvidenceResolution[]; // the latest revision of each, F19
};

export type MissingReason = "no-study-area" | "no-footprint" | "analysis-not-current";

/** R4: why a phase has no output yet, or null when it has one. */
export function missingReason(phase: PhaseKey, facts: PhaseFacts): MissingReason | null {
  switch (phase) {
    case "site":
      return facts.studyArea ? null : "no-study-area";
    case "footprint":
      return facts.footprint ? null : "no-footprint";
    case "evidence":
    case "screening":
    case "studies":
      if (!facts.studyArea) return "no-study-area";
      return facts.run && facts.rules ? null : "analysis-not-current";
    case "impact":
      if (!facts.studyArea) return "no-study-area";
      if (!facts.footprint) return "no-footprint";
      return facts.run && facts.rules ? null : "analysis-not-current";
  }
}

function fingerprint(payload: unknown): string {
  return sha256(canonicalJson(payload));
}

const pairsOf = (resolutions: EvidenceResolution[]) =>
  resolutions
    .map((r) => ({ resourceType: r.resourceTypeKey, mappedBy: r.mappedBy, notMappedBy: r.notMappedBy, revision: r.revision }))
    .sort((a, b) => (`${a.resourceType}:${a.mappedBy}:${a.notMappedBy}` < `${b.resourceType}:${b.mappedBy}:${b.notMappedBy}` ? -1 : 1));

/** The latest resolutions whose exact pair of dataset versions is one of the run's disagreements (F19 R9). */
export function applicableResolutionsOf(results: AnalysisResults, latest: EvidenceResolution[]): EvidenceResolution[] {
  return matchResolutions(results.evidenceBase.disagreements, latest)
    .disagreements.map((d) => d.resolution)
    .filter((r): r is EvidenceResolution => r !== null);
}

/**
 * Every phase that has an output, drafted and fingerprinted. The fingerprint hashes what the output
 * STATES — ids, revisions, and measured numbers — not the sentence text, so a wording fix doesn't
 * invalidate every review, and a measurement change always does (research-phases.md, "Risks").
 */
export function derivePhaseOutputs(facts: PhaseFacts): Partial<Record<PhaseKey, PhaseOutput>> {
  const outputs: Partial<Record<PhaseKey, PhaseOutput>> = {};
  const { studyArea, footprint, run, rules } = facts;

  if (studyArea) {
    const draft = draftSite(studyArea);
    outputs.site = {
      phase: "site",
      contentSha256: fingerprint({ studyAreaRevision: studyArea.revision }),
      ...draft,
      inputs: [
        { label: "Study area", value: `Revision ${studyArea.revision}` },
        { label: "Source", value: studyArea.sourceNote },
      ],
    };
  }

  if (footprint) {
    const draft = draftFootprint(footprint);
    outputs.footprint = {
      phase: "footprint",
      contentSha256: fingerprint({ footprintRevision: footprint.revision }),
      ...draft,
      inputs: [
        { label: "Footprint", value: `Revision ${footprint.revision}` },
        { label: "Source", value: footprint.sourceNote },
      ],
    };
  }

  if (studyArea && run && rules) {
    // F19 R9: only a resolution recorded for the exact pair the run reports applies. One recorded for
    // earlier data is neither drafted nor fingerprinted, because it is not shown as a current reliance.
    const applicableResolutions = applicableResolutionsOf(run.results, facts.resolutions);
    const context: DraftContext = {
      results: run.results,
      rules,
      datasetTitles: facts.datasetTitles,
      datasetLimitations: facts.datasetLimitations,
      resolutions: applicableResolutions,
    };
    const common = [
      { label: "Study area", value: `Revision ${studyArea.revision}` },
      { label: "City profile", value: `Version ${run.profileVersionNumber}` },
      { label: "Datasets", value: `${run.datasetVersionIds.length} dataset ${run.datasetVersionIds.length === 1 ? "version" : "versions"}` },
    ];
    const add = (phase: PhaseKey, draft: Draft, payload: unknown, extra: PhaseOutput["inputs"] = []) => {
      outputs[phase] = { phase, contentSha256: fingerprint(payload), ...draft, inputs: [...common, ...extra] };
    };

    add(
      "evidence",
      draftEvidence(context),
      {
        evidenceBase: run.results.evidenceBase,
        datasetVersionIds: run.datasetVersionIds,
        resolutions: pairsOf(applicableResolutions),
      },
    );
    add("screening", draftScreening(context), {
      screening: run.results.screening,
      gaps: run.results.evidenceBase.gaps,
    });
    add("studies", draftStudies(context), {
      studyFlags: run.results.studyFlags,
      namedStudies: rules.studyTriggers
        .map((t) => ({ study: t.study, triggerKey: t.key, resourceType: t.resourceType }))
        .sort((a, b) => (a.triggerKey < b.triggerKey ? -1 : 1)),
      limits: run.results.limits,
    });
    if (footprint) {
      add(
        "impact",
        draftImpact(context),
        { impacts: run.results.impacts, limits: run.results.limits, footprintRevision: footprint.revision },
        [{ label: "Footprint", value: `Revision ${footprint.revision}` }],
      );
    }
  }
  return outputs;
}

// ---------------------------------------------------------------------------------------------
// Reviews and their derived state (R5, R6, R8, R10).
// ---------------------------------------------------------------------------------------------

export type PhaseReview = {
  id: string;
  phase: PhaseKey;
  contentSha256: string;
  verdict: "reviewed" | "revision_requested";
  note: string | null;
  summary: { templateVersion: number; headline: string; lines: string[] };
  reviewedByName: string;
  reviewedAt: Date;
};

export type ReviewState =
  | { kind: "to-do"; reason: "no-study-area" | "no-footprint" }
  | { kind: "updating"; status: AnalysisStatus } // the inputs exist and the analysis isn't current
  | { kind: "needs-review"; changedSince: PhaseReview | null } // changedSince: the newest earlier review, if any
  | { kind: "reviewed"; review: PhaseReview }
  | { kind: "revision-requested"; review: PhaseReview };

export type PhaseView = {
  phase: PhaseKey;
  output: PhaseOutput | null;
  state: ReviewState;
  history: PhaseReview[]; // R8: newest first
  changes: LineDiff | null; // R10: present when changedSince is
};

/**
 * R5: each phase is in exactly one review state, derived from records and never from a flag. The newest
 * review whose fingerprint equals the output's decides between reviewed and revision-requested; with
 * none, the phase needs review, and `changedSince` is the newest review at any other fingerprint.
 * `reviews` may be in any order.
 */
export function buildPhaseViews(facts: PhaseFacts, reviews: PhaseReview[]): PhaseView[] {
  const outputs = derivePhaseOutputs(facts);
  const newestFirst = (a: PhaseReview, b: PhaseReview) =>
    b.reviewedAt.getTime() - a.reviewedAt.getTime() || (a.id < b.id ? 1 : -1);

  return PHASES.map((phase): PhaseView => {
    const history = reviews.filter((r) => r.phase === phase).sort(newestFirst);
    const output = outputs[phase] ?? null;
    if (!output) {
      const reason = missingReason(phase, facts);
      if (reason === null) throw new Error(`phase ${phase} has neither an output nor a missing reason`);
      return {
        phase,
        output: null,
        state: reason === "analysis-not-current" ? { kind: "updating", status: facts.status } : { kind: "to-do", reason },
        history,
        changes: null,
      };
    }
    const atThisOutput = history.find((r) => r.contentSha256 === output.contentSha256);
    if (atThisOutput) {
      return {
        phase,
        output,
        state:
          atThisOutput.verdict === "reviewed"
            ? { kind: "reviewed", review: atThisOutput }
            : { kind: "revision-requested", review: atThisOutput },
        history,
        changes: null,
      };
    }
    const changedSince = history[0] ?? null;
    return {
      phase,
      output,
      state: { kind: "needs-review", changedSince },
      history,
      // R10: the headline is part of what was said, so a changed area or count shows in the comparison.
      changes: changedSince
        ? diffLines([changedSince.summary.headline, ...changedSince.summary.lines], [output.headline, ...output.lines])
        : null,
    };
  });
}

/** F19 R9: the disagreements in the run that have no recorded resolution, for the Overview's "not known" list. */
export function countUnresolvedDisagreements(facts: PhaseFacts): number {
  if (!facts.run) return 0;
  return matchResolutions(facts.run.results.evidenceBase.disagreements, facts.resolutions).disagreements.filter(
    (d) => d.resolution === null,
  ).length;
}
