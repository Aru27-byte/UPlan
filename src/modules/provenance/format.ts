import type {
  ConfidenceLevel,
  DerivedProvenance,
  EvidenceAttributes,
  EvidenceProvenance,
  RuleProvenance,
} from "./types";

// The one formatter (TechDesign/provenance.md, R6). No other file in the repository formats a
// source, a date, or a confidence level for display — the map workspace, the evidence/impact
// tables, the report, and every export all call these same functions (R8). The same goes for a
// measured number: values are stored unrounded and rounded only here (conventions.md).

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

/** evidence-layers.md R13: the label every source line of an illustrative dataset carries. */
export const SAMPLE_SOURCE_PREFIX = "Sample data (illustrative) — ";

function formatCitation(rule: RuleProvenance): string {
  const reference = rule.ordinance
    ? `${rule.codeSection}, ${rule.ordinance}`
    : `${rule.codeSection} (code section only)`;
  return `${reference} (in force ${rule.effectiveOn})`;
}

export function formatEvidenceProvenance(p: EvidenceProvenance): FormattedProvenance {
  // R2: the source date and the retrieval date are never conflated — retrievedLine is always
  // present and always separate, even when sourceAsOn is null.
  const source =
    p.sourceAsOn !== null
      ? `${p.publisher} (${p.license}) — sourced ${p.sourceAsOn}`
      : `${p.publisher} (${p.license}) — publisher gives no survey date: ${p.sourceAsOfNote}`;
  return {
    sourceLine: p.isSample ? `${SAMPLE_SOURCE_PREFIX}${source}` : source,
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

// ---------------------------------------------------------------------------------------------
// Measured numbers (research-phases.md R2). Every value passed in is stored, unrounded; these are
// the only places it is rounded. `Intl.NumberFormat` with a fixed locale so the same number reads
// the same on any machine, in a page or in a printed document.
// ---------------------------------------------------------------------------------------------

const ONE_DECIMAL = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const WHOLE = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function formatAcres(acres: number): string {
  return `${ONE_DECIMAL.format(acres)} acres`;
}

export function formatSqFt(sqFt: number): string {
  return `${WHOLE.format(sqFt)} sq ft`;
}

export function formatFeet(feet: number): string {
  return `${WHOLE.format(feet)} ft`;
}

export function formatCount(count: number, singular: string, plural: string): string {
  return `${WHOLE.format(count)} ${count === 1 ? singular : plural}`;
}

/**
 * A stored UTC instant, shown in the jurisdiction's own time zone (conventions.md: "Timestamps are
 * stored in UTC and displayed in the jurisdiction's time_zone"). Legal dates (`*_on`) are plain
 * YYYY-MM-DD strings and never pass through here, so no time zone can shift them.
 */
export function formatTimestamp(instant: Date | string, timeZone: string): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(date.getTime())) throw new Error(`not a timestamp: ${String(instant)}`);
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

// ---------------------------------------------------------------------------------------------
// The seven attributes behind an evidence item's confidence label (evidence-review.md R1–R5).
// ---------------------------------------------------------------------------------------------

export type EvidenceConsistency = "agree" | "disagree" | "single-source";

export type AttributeLine = { label: string; value: string };

const AUTHORITY_LABEL: Record<EvidenceAttributes["authority"], string> = {
  federal: "Federal agency",
  state: "State agency",
  regional: "Regional agency",
  county: "County",
  local: "City",
};

const PRECISION_LABEL: Record<EvidenceAttributes["spatialPrecision"], string> = {
  site: "Site scale",
  parcel: "Parcel scale",
  regional: "Regional scale",
  coarse: "Coarse",
};

const CONSISTENCY_LABEL: Record<EvidenceConsistency, string> = {
  agree: "Sources agree",
  disagree: "Sources disagree",
  "single-source": "Single source",
};

/** Whole years from `from` to `today` (both YYYY-MM-DD). Never negative: a future date reads as 0. */
function wholeYearsBetween(from: string, today: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  if (fy === undefined || fm === undefined || fd === undefined) throw new Error(`not a date: ${from}`);
  if (ty === undefined || tm === undefined || td === undefined) throw new Error(`not a date: ${today}`);
  const hadAnniversary = tm > fm || (tm === fm && td >= fd);
  return Math.max(0, ty - fy - (hadAnniversary ? 0 : 1));
}

/**
 * R1–R5: the seven labelled lines. `today` is the caller's injected clock (conventions.md), the one
 * input to the data-age line, so the same attributes read the same on the same day. No line applies a
 * "current", "recent", or "old" label, because no threshold for one is decided (R3), and
 * `retrievedAt` is never shown as the publisher's date (F4).
 */
export function formatEvidenceAttributes(
  attributes: EvidenceAttributes,
  context: { today: string; mapStatus: "regulatory" | "approximate"; consistency: EvidenceConsistency },
): AttributeLine[] {
  const age =
    attributes.sourceAsOfOn !== null
      ? `Published ${attributes.sourceAsOfOn}, ${formatYears(wholeYearsBetween(attributes.sourceAsOfOn, context.today))}`
      : `The publisher gives no date: ${attributes.sourceAsOfNote}`;
  return [
    { label: "Source authority", value: AUTHORITY_LABEL[attributes.authority] },
    { label: "Data age", value: age },
    { label: "Spatial precision", value: PRECISION_LABEL[attributes.spatialPrecision] },
    { label: "Verification", value: "Mapped remotely — not field verified" },
    {
      label: "Boundary status",
      value:
        context.mapStatus === "regulatory"
          ? "Regulatory boundary"
          : "Approximate — a site study sets the regulated boundary",
    },
    { label: "Consistency", value: CONSISTENCY_LABEL[context.consistency] },
    { label: "Professional review", value: "None" },
  ];
}

function formatYears(years: number): string {
  if (years === 0) return "less than a year before today";
  return `${years} ${years === 1 ? "year" : "years"} before today`;
}
