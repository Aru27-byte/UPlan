import { inArray } from "drizzle-orm";

import { getRunDatasetVersionIds, type AnalysisResults, type EvidenceResolution } from "@/modules/analysis";
import { getDatasetVersionProvenance, getDatasetVersionQuality } from "@/modules/evidence";
import { findRuleCitation, type ProfileDocument } from "@/modules/profiles";
import type { DerivedProvenance, EvidenceProvenance } from "@/modules/provenance";
import { appUser } from "@/platform/auth-tables";
import { db } from "@/platform/db";

import type { ReportResolution } from "./sections";

// TechDesign/locked-report.md — the reads both the final document (render.ts, from pinned records) and the
// live preview of a step (live.ts, from the current ones) resolve a run's content with, so the two can't
// resolve it differently. Each takes ids and rows it was handed: none reads "current".

/** Provenance, title, and known limitation of every dataset version the run pinned. */
export async function loadRunSources(runId: string) {
  const datasetProvenance = new Map<string, EvidenceProvenance>();
  const datasetTitles = new Map<string, string>();
  const datasetLimitations = new Map<string, string>();
  for (const versionId of await getRunDatasetVersionIds(runId)) {
    datasetProvenance.set(versionId, await getDatasetVersionProvenance(versionId));
    const quality = await getDatasetVersionQuality(versionId);
    datasetTitles.set(versionId, quality.datasetTitle);
    if (quality.knownLimitation) datasetLimitations.set(versionId, quality.knownLimitation);
  }
  return { datasetProvenance, datasetTitles, datasetLimitations };
}

/** R2/R4 of provenance.md: every derived figure carries every source it came from, resolved from the run's own evidence/rule ids — never invented at render time. */
export function buildImpactProvenance(
  results: AnalysisResults,
  profileDocument: ProfileDocument,
  datasetProvenance: Map<string, EvidenceProvenance>,
): Map<string, DerivedProvenance> {
  const provenance = new Map<string, DerivedProvenance>();
  for (const impact of results.impacts) {
    const evidence = impact.evidence.map((e) => {
      const found = datasetProvenance.get(e.datasetVersionId);
      if (!found) throw new Error(`impact ${impact.impactKey} cites dataset version ${e.datasetVersionId}, which the run did not pin`);
      return found;
    });
    const rules = impact.ruleKeys
      .map((key) => findRuleCitation(profileDocument, key))
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .map((r) => ({ ...r.citation, effectiveOn: r.effectiveOn }));
    provenance.set(impact.impactKey, { rules, evidence });
  }
  return provenance;
}

/** The resolutions a section shows, with their titles and authors' names. */
export async function toReportResolutions(rows: EvidenceResolution[], datasetTitles: Map<string, string>): Promise<ReportResolution[]> {
  const authorIds = [...new Set(rows.map((r) => r.createdBy))];
  const authors =
    authorIds.length === 0 ? [] : await db.select({ id: appUser.id, name: appUser.name }).from(appUser).where(inArray(appUser.id, authorIds));
  const authorName = (id: string): string => authors.find((a) => a.id === id)?.name ?? "Unknown person";
  return rows.map((r) => ({
    resourceType: r.resourceTypeKey,
    mappedByTitle: datasetTitles.get(r.mappedBy) ?? r.mappedBy,
    notMappedByTitle: datasetTitles.get(r.notMappedBy) ?? r.notMappedBy,
    revision: r.revision,
    reliedOn: r.reliedOn as ReportResolution["reliedOn"],
    rationale: r.rationale,
    createdByName: authorName(r.createdBy),
    createdAt: r.createdAt,
  }));
}
