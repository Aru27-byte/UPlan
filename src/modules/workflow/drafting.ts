import {
  SCREENING_CANNOT_SEE,
  STUDY_LABEL,
  STUDY_NOT_FLAGGED,
  describeImpact,
  describeLimit,
  describeScreeningGap,
  describeScreeningRow,
  type AnalysisResults,
  type EvidenceResolution,
} from "@/modules/analysis";
import { isSampleNote, type GeometrySummary } from "@/modules/decisions";
import type { InForceRules } from "@/modules/profiles";
import { formatAcres, formatCount, formatFeet, formatSqFt } from "@/modules/provenance";

// TechDesign/research-phases.md, "Drafting" (R2, R3, R13). Each function is pure: it takes the facts a
// phase is drafted from and returns a headline and its sentences. The wording is a fixed template over
// measured numbers; no language model writes any of it (decided 2026-09-26). Every number passes through
// provenance's display formatters, the one place anything is rounded. No template judges: they state what
// is mapped, what is near, and what is not seen (P2). drafting.test.ts renders every template over
// populated, empty, and gap-only fixtures and fails on any verdict-shaped word.

/** Stored on every review (phase_review.summary), so history stays readable after a template's wording changes. */
export const TEMPLATE_VERSION = 1;

export type Draft = { headline: string; lines: string[] };

export type DraftContext = {
  results: AnalysisResults;
  rules: InForceRules;
  datasetTitles: Map<string, string>; // by dataset version id
  datasetLimitations: Map<string, string>; // by dataset version id
  resolutions: EvidenceResolution[]; // the latest of each
};

const labelOf = (rules: InForceRules, resourceType: string): string =>
  rules.resourceTypes.find((r) => r.key === resourceType)?.label ?? resourceType;

const titleOf = (titles: Map<string, string>, versionId: string): string => titles.get(versionId) ?? "an unnamed source";

function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

const SAMPLE_NOTICE = "This boundary is sample data, not a real site.";

export function draftSite(studyArea: GeometrySummary): Draft {
  const lines = [`Source: ${sentence(studyArea.sourceNote)}`];
  if (isSampleNote(studyArea.sourceNote)) lines.push(SAMPLE_NOTICE);
  lines.push("The study area is not limited to parcel lines, because habitat does not follow them.");
  return { headline: `Study area drawn: ${formatAcres(studyArea.areaAcres)} (revision ${studyArea.revision}).`, lines };
}

export function draftFootprint(footprint: GeometrySummary): Draft {
  const lines = [`Source: ${sentence(footprint.sourceNote)}`];
  if (isSampleNote(footprint.sourceNote)) lines.push(SAMPLE_NOTICE);
  lines.push("The footprint is the proposal under evaluation, not evidence.");
  return { headline: `Footprint traced: ${formatAcres(footprint.areaAcres)} (revision ${footprint.revision}).`, lines };
}

export function draftEvidence(c: DraftContext): Draft {
  const { results, rules } = c;
  const total = rules.resourceTypes.length;
  const gapped = new Set(results.evidenceBase.gaps.map((g) => g.resourceType));
  const withEvidence = total - gapped.size;

  const lines: string[] = [];
  for (const gap of results.evidenceBase.gaps) {
    lines.push(`${labelOf(rules, gap.resourceType)}: ${describeScreeningGap(gap.reason)}`);
  }
  for (const d of results.evidenceBase.disagreements) {
    const a = titleOf(c.datasetTitles, d.mappedBy);
    const b = titleOf(c.datasetTitles, d.notMappedBy);
    lines.push(`${labelOf(rules, d.resourceType)}: ${formatSqFt(d.area)} is mapped by ${a} and not by ${b}.`);
    const resolution = c.resolutions.find(
      (r) => r.resourceTypeKey === d.resourceType && r.mappedBy === d.mappedBy && r.notMappedBy === d.notMappedBy,
    );
    if (resolution) {
      const side =
        resolution.reliedOn === "mapped_by" ? a : resolution.reliedOn === "not_mapped_by" ? b : "neither source";
      lines.push(`The planner relies on ${side} (revision ${resolution.revision}). The measurements above are unchanged.`);
    }
  }
  lines.push(`Dataset versions used: ${formatCount(new Set([...c.datasetTitles.keys()]).size, "version", "versions")}.`);
  return {
    headline: `${withEvidence} of ${formatCount(total, "resource type", "resource types")} in the profile ${
      withEvidence === 1 ? "has" : "have"
    } mapped evidence over the study area.`,
    lines,
  };
}

export function draftScreening(c: DraftContext): Draft {
  const { results, rules } = c;
  const withFeatures = results.screening.filter((r) => r.intersectingFeatureCount > 0).length;
  const lines = results.screening.map((row) => `${labelOf(rules, row.resourceType)}: ${describeScreeningRow(row)}`);
  for (const gap of results.evidenceBase.gaps) {
    lines.push(`${labelOf(rules, gap.resourceType)}: ${describeScreeningGap(gap.reason)}`);
  }
  lines.push(SCREENING_CANNOT_SEE);
  return {
    headline:
      results.screening.length === 0
        ? "No mapped dataset covers the study area."
        : `${withFeatures} of ${formatCount(results.screening.length, "mapped dataset", "mapped datasets")} ${
            withFeatures === 1 ? "has" : "have"
          } features inside the study area.`,
    lines,
  };
}

export function draftStudies(c: DraftContext): Draft {
  const { results, rules } = c;
  const named = [...new Set(rules.studyTriggers.map((t) => t.study))].sort();
  const lines: string[] = [];
  let flaggedCount = 0;
  for (const study of named) {
    const flags = results.studyFlags.filter((f) => f.study === study);
    if (flags.length === 0) {
      lines.push(`${STUDY_LABEL[study]}: ${STUDY_NOT_FLAGGED}`);
      continue;
    }
    flaggedCount += 1;
    const resources = [...new Set(flags.map((f) => labelOf(rules, f.resourceType)))].join(", ");
    const nearest = Math.min(...flags.map((f) => f.nearestDistanceFt));
    lines.push(
      nearest === 0
        ? `${STUDY_LABEL[study]}: flagged by ${resources}; a mapped feature is inside the study area.`
        : `${STUDY_LABEL[study]}: flagged by ${resources}; the nearest mapped feature is ${formatFeet(nearest)} away.`,
    );
  }
  lines.push(SCREENING_CANNOT_SEE);
  return {
    headline:
      named.length === 0
        ? "The profile names no studies."
        : `${flaggedCount} of ${formatCount(named.length, "study", "studies")} named in the profile ${
            flaggedCount === 1 ? "is" : "are"
          } flagged by mapped data.`,
    lines,
  };
}

export function draftImpact(c: DraftContext): Draft {
  const { results, rules } = c;
  const resourceCount = new Set(results.impacts.map((i) => i.resourceType)).size;
  const lines = results.impacts.map((i) => describeImpact(i, labelOf(rules, i.resourceType)));
  if (results.impacts.length === 0) lines.push("This describes the mapped data, not a finding about the site.");
  for (const limit of results.limits) {
    lines.push(
      describeLimit(limit, {
        resourceLabel: limit.resourceType ? labelOf(rules, limit.resourceType) : null,
        datasetLimitation: limit.datasetVersionId ? (c.datasetLimitations.get(limit.datasetVersionId) ?? null) : null,
      }),
    );
  }
  return {
    headline:
      results.impacts.length === 0
        ? "No mapped resource or buffer overlaps the footprint."
        : `${formatCount(results.impacts.length, "measured overlap", "measured overlaps")} across ${formatCount(
            resourceCount,
            "resource type",
            "resource types",
          )}.`,
    lines,
  };
}
