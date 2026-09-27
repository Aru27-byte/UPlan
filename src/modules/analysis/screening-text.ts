import { formatCount, formatFeet, formatSqFt } from "@/modules/provenance";

import type { ScreeningRow } from "./results";

// F14 R13: the register's sentences are fixed templates over PostGIS numbers. No language model
// writes any of it, and no template judges: it states what is mapped, what is near, and what
// is not seen (P2). Numbers pass through provenance's display formatters, so nothing here rounds.

/** The "Finding" sentence for one screening row (study-scoping.md R1–R4, R8). */
export function describeScreeningRow(row: ScreeningRow): string {
  const parts: string[] = [];

  if (row.intersectingFeatureCount === 0) {
    parts.push("No mapped feature is inside the study area.");
  } else {
    const measured = [
      row.overlapAreaSqFt > 0 ? formatSqFt(row.overlapAreaSqFt) : null,
      row.overlapLengthFt > 0 ? formatFeet(row.overlapLengthFt) : null,
    ].filter((m): m is string => m !== null);
    parts.push(
      `Mapped in the study area: ${formatCount(row.intersectingFeatureCount, "feature", "features")}${
        measured.length > 0 ? `, ${measured.join(" and ")}` : ""
      }.`,
    );
  }

  if (row.nearestDistanceFt === null) {
    // R3: a search distance is stated, so "none" can't be misread as "none anywhere".
    parts.push(`None mapped within ${formatFeet(row.searchedWithinFt)}.`);
  } else if (row.intersectingFeatureCount === 0) {
    parts.push(`The nearest mapped feature is ${formatFeet(row.nearestDistanceFt)} away.`);
  }

  for (const reach of row.bufferReaches) {
    const count = formatCount(reach.featureCount, "feature", "features");
    parts.push(
      reach.applicability === "yes"
        ? `${count} just off the site, whose ${reach.ruleKey} buffer reaches onto it.`
        : `${count} just off the site, whose ${reach.ruleKey} buffer may reach onto it (it depends on an attribute the evidence lacks).`,
    );
  }

  if (row.approximate) {
    parts.push("The mapped boundary is approximate; a site study sets the regulated boundary.");
  }
  return parts.join(" ");
}

/** The gap row's sentence, for a resource type with no usable dataset over the study area (R7). */
export function describeScreeningGap(reason: "no-dataset-mapped" | "coverage-excludes-study-area"): string {
  return reason === "no-dataset-mapped"
    ? "No dataset is mapped for this resource type, so nothing can be said about it."
    : "The mapped data does not cover the study area, so nothing can be said about it.";
}

/** The statement both the Screening and Studies pages open with (R9): what a screen cannot see. */
export const SCREENING_CANNOT_SEE =
  "Nothing mapped is not the same as nothing present: a screen can't see what no dataset records.";

/** R6: printed beside every study the profile names that the mapped data does not flag. */
export const STUDY_NOT_FLAGGED =
  "not flagged by mapped data. The city decides which studies an application needs.";
