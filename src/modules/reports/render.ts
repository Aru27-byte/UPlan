import { eq, sql } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";

import { AnalysisResultsSchema, type AnalysisResults } from "@/modules/analysis";
import { getDecisionForAnalysis, getLatestGeometryInternal } from "@/modules/decisions";
import { getDatasetVersionProvenance } from "@/modules/evidence";
import {
  findRuleCitation,
  getCurrentProfileForAnalysis,
  getJurisdictionForAnalysis,
  ProfileDocumentSchema,
  type ProfileDocument,
} from "@/modules/profiles";
import type { DerivedProvenance } from "@/modules/provenance";
import { db } from "@/platform/db";
import { ValidationError } from "@/platform/errors";

import { analysisRun } from "../analysis/tables";
import { ReportDocument } from "./document";
import { report } from "./tables";

// TechDesign/locked-report.md — the report's maps are ST_AsSVG paths from the same pinned
// geometries the numbers came from, never a screenshot of the live WebGL map (D12).
async function geometryAsSvgPath(
  decisionId: string,
  kind: "study_area" | "footprint",
): Promise<string | null> {
  const geom = await getLatestGeometryInternal(decisionId, kind);
  if (!geom) return null;
  const [row] = await db
    .execute<{ path: string }>(
      sql`select ST_AsSVG(ST_Transform(geom, 3857), 0, 6) as path
          from decision_geometry where decision_id = ${decisionId} and kind = ${kind} and revision = ${geom.revision}`,
    )
    .then((r) => r.rows);
  return row?.path ?? null;
}

/** R2/R4 of provenance.md: every derived figure carries every source it came from, resolved from the run's own evidence/rule ids — never invented at render time. */
async function buildImpactProvenance(
  results: AnalysisResults,
  profileDocument: ProfileDocument | null,
): Promise<Map<string, DerivedProvenance>> {
  const provenance = new Map<string, DerivedProvenance>();
  for (const impact of results.impacts) {
    const evidence = await Promise.all(
      impact.evidence.map((e) => getDatasetVersionProvenance(e.datasetVersionId)),
    );
    const rules = profileDocument
      ? impact.ruleKeys
          .map((key) => findRuleCitation(profileDocument, key))
          .filter((r): r is NonNullable<typeof r> => r !== null)
          .map((r) => ({ ...r.citation, effectiveOn: r.effectiveOn }))
      : [];
    provenance.set(impact.impactKey, { rules, evidence });
  }
  return provenance;
}

/** Assembles the report document's HTML from a decision's pinned run results. */
async function buildReportHtml(
  decisionId: string,
  permitNumber: string | null,
  applicationFiledOn: string | null,
  decisionTitle: string,
  results: AnalysisResults,
): Promise<string> {
  const decision = await getDecisionForAnalysis(decisionId);
  const jurisdiction = await getJurisdictionForAnalysis(decision.jurisdictionId);
  const currentProfile = await getCurrentProfileForAnalysis(decision.jurisdictionId);
  const profileDocument = currentProfile ? ProfileDocumentSchema.parse(currentProfile.document) : null;
  if (!profileDocument) {
    throw new ValidationError(`decision ${decisionId} has no approved profile to report against`);
  }

  const impactProvenance = await buildImpactProvenance(results, profileDocument);
  const studyAreaSvgPath = (await geometryAsSvgPath(decisionId, "study_area")) ?? "";
  const footprintSvgPath = await geometryAsSvgPath(decisionId, "footprint");

  const html = renderToStaticMarkup(
    ReportDocument({
      decisionTitle,
      permitNumber,
      jurisdictionName: jurisdiction.name,
      applicationFiledOn,
      profileDocument,
      results,
      impactProvenance,
      studyAreaSvgPath,
      footprintSvgPath,
    }),
  );
  return `<!doctype html>${html}`;
}

export async function renderReportHtml(reportId: string): Promise<string> {
  const [row] = await db.select().from(report).where(eq(report.id, reportId));
  if (!row) throw new Error(`report ${reportId} not found`);
  const [run] = await db.select().from(analysisRun).where(eq(analysisRun.id, row.analysisRunId));
  if (!run) throw new Error(`analysis run ${row.analysisRunId} for report ${reportId} not found`);

  const decision = await getDecisionForAnalysis(row.decisionId);
  return buildReportHtml(
    row.decisionId,
    decision.permitNumber,
    decision.applicationFiledOn,
    decision.title,
    AnalysisResultsSchema.parse(run.results), // untyped jsonb (conventions.md: no `as`-cast on external data)
  );
}
