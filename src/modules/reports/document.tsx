import type { GeometrySvg } from "@/modules/decisions";
import { findRuleCitation, type ProfileDocument } from "@/modules/profiles";
import type { AnalysisResults } from "@/modules/analysis";
import { formatEvidenceProvenance, formatRuleProvenance, formatTimestamp, type DerivedProvenance, type EvidenceProvenance } from "@/modules/provenance";

import {
  DetailsSection,
  EvidenceSection,
  FootprintSection,
  ImpactSection,
  NOT_RECORDED,
  REPORT_CONTENT_STYLES,
  RulesSection,
  ScreeningSection,
  SiteSection,
  StudiesSection,
  type ReportResolution,
  type RunContent,
} from "./sections";
import type { PhaseKey, ReportSection, ReportSnapshot } from "./snapshot";

// TechDesign/locked-report.md — the document's React tree, stitched from the per-step sections in
// sections.tsx. Server Components only; never interactive (D12: printed by Playwright, not screenshotted).
// Every prop is already-resolved, pinned data: nothing here fetches, and nothing reads "current" (F22 R11).
// No prop carries a judgment, a recommendation, or free text a future change could repurpose for one (R6):
// the only free text is the planner's own reason and adopted section narrative, printed in labeled places
// as the planner's words, never as UPlan's finding (see the denylist check in document.test.ts).

export type ReportDocumentProps = {
  cityName: string;
  stateCode: string;
  timeZone: string;
  versionNumber: number;
  requestedAt: Date; // when research was finished: deterministic, unlike the moment of rendering
  changeNote: string | null;
  snapshot: ReportSnapshot;
  profileVersionNumber: number;
  profileDocument: ProfileDocument;
  rulesResolvedFor: Record<string, string>;
  results: AnalysisResults;
  impactProvenance: Map<string, DerivedProvenance>; // by Impact.impactKey
  datasetProvenance: Map<string, EvidenceProvenance>; // by dataset version id, for every version the run pinned
  datasetTitles: Map<string, string>; // by dataset version id
  datasetLimitations: Map<string, string>; // by dataset version id: the dataset's own recorded limitation
  resolutions: ReportResolution[];
  studyAreaSvg: GeometrySvg;
  footprintSvg: GeometrySvg | null;
};

const PHASE_TITLE: Record<PhaseKey, string> = {
  site: "Site",
  evidence: "Evidence",
  screening: "Screening",
  studies: "Studies",
  footprint: "Footprint",
  impact: "Impact",
};

// The page and the body; the content's own typography is REPORT_CONTENT_STYLES, shared with the in-app
// preview of each section.
const PRINT_STYLES = `
  @page { size: letter; margin: 0.75in; }
  body { margin: 0; }
  ${REPORT_CONTENT_STYLES}
`;

export function ReportDocument(props: ReportDocumentProps) {
  const { snapshot, results, profileDocument } = props;
  const details = snapshot.details;
  const sectionOf = (key: PhaseKey): ReportSection => {
    const found = snapshot.sections.find((s) => s.phase === key);
    if (!found) throw new Error(`the snapshot has no ${key} section`);
    return found;
  };
  const when = (instant: Date | string): string => formatTimestamp(instant, props.timeZone);
  const run: RunContent = props;

  // R14: every rule any figure cites, once.
  const citedRuleKeys = [...new Set([...results.impacts.flatMap((i) => i.ruleKeys), ...results.studyFlags.flatMap((f) => f.ruleKeys)])].sort();
  const pinnedVersionIds = [...props.datasetProvenance.keys()].sort();
  const provenanceOf = (versionId: string): EvidenceProvenance => {
    const found = props.datasetProvenance.get(versionId);
    if (!found) throw new Error(`no provenance was loaded for dataset version ${versionId}`);
    return found;
  };
  const titleOf = (versionId: string): string => props.datasetTitles.get(versionId) ?? versionId;

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>{`${details.title} — UPlan document, version ${props.versionNumber}`}</title>
        {/* Print-only, presentational styling (D12, D20) — no text content, so it can never carry a
            judgment; document.test.ts's denylist only ever checks rendered text, not this markup. */}
        <style>{PRINT_STYLES}</style>
      </head>
      <body>
        <main className="report-paper">
          <h1>{details.title}</h1>
          <p className="meta">
            {props.cityName}, {props.stateCode} · Version {props.versionNumber} · Research finished {when(props.requestedAt)}
          </p>
          <p className="meta">
            Built from:{" "}
            {snapshot.sections
              .map((s) => `${PHASE_TITLE[s.phase]} ${s.sectionVersionNumber === null ? "analysis draft" : `section version ${s.sectionVersionNumber}`}`)
              .join("; ")}
          </p>

          <DetailsSection details={details} profileVersionNumber={props.profileVersionNumber} />
          <RulesSection run={run} />

          {snapshot.previousVersion !== null ? (
            <>
              <h2>What changed since version {snapshot.previousVersion}</h2>
              <p>
                <strong>Reason given by the planner:</strong> {props.changeNote ?? NOT_RECORDED}
              </p>
              <ul>
                {snapshot.sections
                  .filter((s) => s.changed)
                  .map((s) => (
                    <li key={s.phase}>The {PHASE_TITLE[s.phase]} section changed.</li>
                  ))}
                {snapshot.detailsChanged ? <li>The project details changed.</li> : null}
                {!snapshot.detailsChanged && snapshot.sections.every((s) => !s.changed) ? (
                  <li>No section or project detail differs from the previous version.</li>
                ) : null}
              </ul>
            </>
          ) : null}

          <SiteSection content={sectionOf("site")} studyAreaSvg={props.studyAreaSvg} />
          <FootprintSection content={sectionOf("footprint")} studyAreaSvg={props.studyAreaSvg} footprintSvg={props.footprintSvg} />
          <EvidenceSection content={sectionOf("evidence")} run={run} />
          <ScreeningSection content={sectionOf("screening")} run={run} />
          <StudiesSection content={sectionOf("studies")} run={run} />
          <ImpactSection content={sectionOf("impact")} run={run} />

          <h2>Source register</h2>
          <h3>Datasets</h3>
          <table>
            <thead>
              <tr>
                <th scope="col">Dataset</th>
                <th scope="col">Source</th>
                <th scope="col">Retrieved</th>
                <th scope="col">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {pinnedVersionIds.map((versionId) => {
                const provenance = formatEvidenceProvenance(provenanceOf(versionId));
                return (
                  <tr key={versionId}>
                    <th scope="row">{titleOf(versionId)}</th>
                    <td>{provenance.sourceLine}</td>
                    <td>{provenance.retrievedLine}</td>
                    <td>{provenance.confidenceLine}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <h3>Rules</h3>
          <ul>
            {citedRuleKeys.map((key) => {
              const rule = findRuleCitation(profileDocument, key);
              if (!rule) throw new Error(`rule ${key} is cited but is not in profile version ${props.profileVersionNumber}`);
              return <li key={key}>{formatRuleProvenance({ ...rule.citation, effectiveOn: rule.effectiveOn }).citations.join("; ")}</li>;
            })}
          </ul>

        </main>
      </body>
    </html>
  );
}
