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
// planner's adopted narrative, one append-only report_section_version row per change, bound to the
// fingerprint it was built on.

export const PHASES = ["site", "evidence", "screening", "studies", "footprint", "impact"] as const;
export type PhaseKey = (typeof PHASES)[number];

export type PhaseOutput = {
  phase: PhaseKey;
  contentSha256: string; // R7: the engine fingerprint a section version is bound to
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
 * invalidate every section version, and a measurement change always does (research-phases.md, "Risks").
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

/** F19 R9: the disagreements in the run that have no recorded resolution, for the Overview's "not known" list. */
export function countUnresolvedDisagreements(facts: PhaseFacts): number {
  if (!facts.run) return 0;
  return matchResolutions(facts.run.results.evidenceBase.disagreements, facts.resolutions).disagreements.filter(
    (d) => d.resolution === null,
  ).length;
}
