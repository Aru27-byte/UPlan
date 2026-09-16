import type { ConfidenceLevel, DerivedProvenance, EvidenceProvenance, RuleProvenance } from "./types";

// The one formatter (TechDesign/provenance.md, R6). No other file in the repository formats a
// source, a date, or a confidence level for display — the map workspace, the evidence/impact
// tables, the report, and every export all call these same functions (R8).

export type FormattedProvenance = {
  sourceLine: string;
  retrievedLine: string;
  confidenceLine: string | null; // null only for a rules-only DerivedProvenance (R5)
  citations: string[];
};

export const CONFIDENCE_DESCRIPTIONS: Record<ConfidenceLevel, string> = {
  high: "High confidence — current, site-scale survey data.",
  moderate: "Moderate confidence — public data that is dated, coarse, or partly modeled.",
  low: "Low confidence — data that only broadly indicates this resource; a site-specific study sets the real boundary.",
};

const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = { low: 0, moderate: 1, high: 2 };

function formatCitation(rule: RuleProvenance): string {
  const reference = rule.ordinance
    ? `${rule.codeSection}, ${rule.ordinance}`
    : `${rule.codeSection} (code section only)`;
  return `${reference} (in force ${rule.effectiveOn})`;
}

export function formatEvidenceProvenance(p: EvidenceProvenance): FormattedProvenance {
  // R2: the source date and the retrieval date are never conflated — retrievedLine is always
  // present and always separate, even when sourceAsOn is null.
  const sourceLine =
    p.sourceAsOn !== null
      ? `${p.publisher} (${p.license}) — sourced ${p.sourceAsOn}`
      : `${p.publisher} (${p.license}) — publisher gives no survey date: ${p.sourceAsOfNote}`;
  return {
    sourceLine,
    retrievedLine: `Retrieved by UPlan on ${p.retrievedAt.slice(0, 10)}`,
    confidenceLine: CONFIDENCE_DESCRIPTIONS[p.confidence],
    citations: [],
  };
}

export function formatRuleProvenance(p: RuleProvenance): FormattedProvenance {
  return {
    sourceLine: `Adopted rule — ${p.sourceUrl}`,
    retrievedLine: `In force since ${p.effectiveOn}`,
    confidenceLine: null, // R5: confidence describes measured data, not legal text
    citations: [formatCitation(p)],
  };
}

export function formatDerivedProvenance(p: DerivedProvenance): FormattedProvenance {
  const evidenceFormatted = p.evidence.map(formatEvidenceProvenance);
  const lowestConfidence =
    p.evidence.length === 0
      ? null
      : p.evidence.reduce((lowest, e) =>
          CONFIDENCE_RANK[e.confidence] < CONFIDENCE_RANK[lowest.confidence] ? e : lowest,
        );

  return {
    // R4: every source is listed — never collapsed into one blended line.
    sourceLine:
      evidenceFormatted.map((f) => f.sourceLine).join(" · ") || "No measured evidence — rules only.",
    retrievedLine:
      evidenceFormatted.map((f) => f.retrievedLine).join(" · ") || "Not applicable — no measured evidence.",
    confidenceLine:
      lowestConfidence === null
        ? null // R5: rendered by callers as the literal "Not applicable" text below
        : `${CONFIDENCE_DESCRIPTIONS[lowestConfidence.confidence]} (limited by ${lowestConfidence.publisher})`,
    citations: p.rules.map(formatCitation),
  };
}

/** The literal text every caller renders in place of a null confidenceLine (R5). Never blank space. */
export const CONFIDENCE_NOT_APPLICABLE =
  "Not applicable — this figure comes from adopted rules, not measured data.";
