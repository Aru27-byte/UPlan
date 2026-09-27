import { formatFeet, formatSqFt } from "@/modules/provenance";

import type { Impact, StudyName } from "./results";

// One wording of an impact and of a study, for the Impact page, the phase summaries, and the document.
// Fixed templates over PostGIS numbers (impact-analysis.md R6: no field of an Impact expresses a
// judgment, and no sentence here does either).

export const MEASURE_LABEL: Record<Impact["measure"], string> = {
  "feature-area-in-footprint": "Area of the mapped feature inside the footprint",
  "feature-length-in-footprint": "Length of the mapped feature inside the footprint",
  "buffer-area-in-footprint": "Area of the buffer inside the footprint",
};

export const STUDY_LABEL: Record<StudyName, string> = {
  "critical-area-study": "Critical area study",
  "geotechnical-report": "Geotechnical report",
  "arborist-report": "Arborist report",
};

function formatQuantity(impact: Impact, value: number): string {
  return impact.unit === "us-survey-sq-ft" ? formatSqFt(value) : formatFeet(value);
}

/** "4,210 sq ft", or "0 sq ft to 4,210 sq ft" when a rule depends on an attribute the evidence lacks (impact-analysis.md R3). */
export function formatImpactQuantity(impact: Impact): string {
  return impact.min === impact.max
    ? formatQuantity(impact, impact.min)
    : `${formatQuantity(impact, impact.min)} to ${formatQuantity(impact, impact.max)}`;
}

/** The one sentence for an impact, used by the Impact phase's drafted summary. */
export function describeImpact(impact: Impact, resourceLabel: string): string {
  const parts = [`${resourceLabel}: ${MEASURE_LABEL[impact.measure].toLowerCase()}, ${formatImpactQuantity(impact)}`];
  if (impact.approximate) parts.push("approximate boundary");
  if (impact.dependsOn) parts.push(`the range depends on ${impact.dependsOn}, an attribute the evidence doesn't carry`);
  return `${parts.join("; ")}.`;
}
