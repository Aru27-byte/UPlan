import type { ReactNode } from "react";

import {
  MEASURE_LABEL,
  STUDY_LABEL,
  SCREENING_CANNOT_SEE,
  STUDY_NOT_FLAGGED,
  describeLimit,
  describeScreeningGap,
  describeScreeningRow,
  formatImpactQuantity,
  type AnalysisResults,
  type Impact,
} from "@/modules/analysis";
import type { GeometrySvg } from "@/modules/decisions";
import { findRuleCitation, type ProfileDocument } from "@/modules/profiles";
import {
  CONFIDENCE_NOT_APPLICABLE,
  formatDerivedProvenance,
  formatEvidenceProvenance,
  formatRuleProvenance,
  formatSqFt,
  formatTimestamp,
  type DerivedProvenance,
  type EvidenceProvenance,
} from "@/modules/provenance";

import type { ReportDetails } from "./snapshot";

// TechDesign/locked-report.md, "Sections" — the report is stitched from one section per research step. Each
// section is a Server Component over already-resolved data and nothing else: the final document (document.tsx)
// renders them from pinned records, and each step page renders the same components from the current records
// as a live preview of what that step will contribute. One component per section is the only copy of its
// markup, so the preview can't drift from the document. None fetches, none reads "current", and none carries a
// judgment (R6): the only free text is the planner's own reason, printed as the planner's words.

export type ReportResolution = {
  resourceType: string;
  mappedByTitle: string;
  notMappedByTitle: string;
  revision: number;
  reliedOn: "mapped_by" | "not_mapped_by" | "neither";
  rationale: string;
  createdByName: string;
  createdAt: Date;
};

/** A phase's drafted summary: the headline and the sentences the planner reviewed. */
export type SectionSummary = { headline: string; lines: string[] };

/** Everything the sections that read an analysis run need, resolved. */
export type RunContent = {
  timeZone: string;
  profileVersionNumber: number;
  profileDocument: ProfileDocument;
  rulesResolvedFor: Record<string, string>;
  results: AnalysisResults;
  impactProvenance: Map<string, DerivedProvenance>; // by Impact.impactKey
  datasetProvenance: Map<string, EvidenceProvenance>; // by dataset version id, for every version the run pinned
  datasetTitles: Map<string, string>; // by dataset version id
  datasetLimitations: Map<string, string>; // by dataset version id: the dataset's own recorded limitation
  resolutions: ReportResolution[];
};

const APPLICATION_TYPE_LABEL = {
  subdivision: "Subdivision",
  short_subdivision: "Short subdivision",
  clearing_grading: "Clearing and grading",
} as const;

const RELIED_ON_TEXT = {
  mapped_by: "the first source",
  not_mapped_by: "the second source",
  neither: "neither source",
} as const;

// Tables and typography for the report's content, scoped to `.report-paper`, so the same rules style the
// printed document and the in-app preview. Presentational only: no text content, so it can never carry a
// judgment (D12, D20).
export const REPORT_CONTENT_STYLES = `
  .report-paper { font-family: Georgia, "Times New Roman", serif; color: #1a1a1a; line-height: 1.5; font-size: 11pt; }
  .report-paper h1 { font-size: 22pt; margin: 0 0 0.2em; }
  .report-paper h2 { font-size: 14pt; margin: 1.6em 0 0.5em; border-bottom: 1px solid #999; padding-bottom: 0.25em; break-after: avoid; }
  .report-paper h2:first-child { margin-top: 0; }
  .report-paper h3 { font-size: 12pt; margin: 1.1em 0 0.4em; break-after: avoid; }
  .report-paper p { margin: 0.5em 0; }
  .report-paper table { width: 100%; border-collapse: collapse; margin-top: 0.5em; font-size: 10pt; }
  .report-paper th, .report-paper td { border: 1px solid #999; padding: 0.4em 0.6em; text-align: left; vertical-align: top; }
  .report-paper th[scope="col"] { background: #ececec; }
  .report-paper th[scope="row"] { background: #f6f6f6; font-weight: 600; width: 28%; }
  .report-paper svg { max-width: 100%; height: auto; border: 1px solid #999; }
  .report-paper tr { break-inside: avoid; }
  .report-paper .banner { border: 2px solid #1a1a1a; padding: 0.6em 0.9em; margin: 0.8em 0; }
  .report-paper .meta { color: #444; margin: 0.2em 0; }
  .report-paper .note { color: #444; font-size: 9.5pt; }
  .report-paper ul { margin: 0.4em 0; padding-left: 1.3em; list-style: disc; }
`;

export const NOT_RECORDED = "Not yet recorded";

/** The viewBox that frames every drawn boundary with a margin. ST_AsSVG negates y, so the y range is negated too. */
export function mapViewBox(studyArea: GeometrySvg, footprint: GeometrySvg | null): string {
  const shapes = footprint ? [studyArea, footprint] : [studyArea];
  const xmin = Math.min(...shapes.map((s) => s.xmin));
  const xmax = Math.max(...shapes.map((s) => s.xmax));
  const ymin = Math.min(...shapes.map((s) => s.ymin));
  const ymax = Math.max(...shapes.map((s) => s.ymax));
  const pad = Math.max(xmax - xmin, ymax - ymin) * 0.05;
  return `${xmin - pad} ${-ymax - pad} ${xmax - xmin + 2 * pad} ${ymax - ymin + 2 * pad}`;
}

function labelOf(profile: ProfileDocument, resourceType: string): string {
  return profile.resourceTypes.find((r) => r.key === resourceType)?.label ?? resourceType;
}

function Summary({ summary }: { summary: SectionSummary }): ReactNode {
  return (
    <>
      <p>
        <strong>{summary.headline}</strong>
      </p>
      <ul>
        {summary.lines.map((line, i) => (
          <li key={`${i}:${line}`}>{line}</li>
        ))}
      </ul>
      <p className="note">Drafted by UPlan&apos;s analysis engine from measurements. No language model wrote this.</p>
    </>
  );
}

/** Overview: the project's details as the document opens with them. */
export function DetailsSection({ details, profileVersionNumber }: { details: ReportDetails; profileVersionNumber: number | null }) {
  return (
    <>
      {details.usesSampleData ? (
        <p className="banner" role="note">
          <strong>Sample data.</strong> This document was built from sample data. It does not describe a real site,
          applicant, or source.
        </p>
      ) : null}
      <table>
        <caption className="note">Project details</caption>
        <tbody>
          <tr>
            <th scope="row">Application type</th>
            <td>{APPLICATION_TYPE_LABEL[details.applicationType]}</td>
          </tr>
          <tr>
            <th scope="row">Parcel or address</th>
            <td>{details.parcelOrAddress ?? NOT_RECORDED}</td>
          </tr>
          <tr>
            <th scope="row">Applicant</th>
            <td>{details.applicant ?? NOT_RECORDED}</td>
          </tr>
          <tr>
            <th scope="row">Project manager</th>
            <td>{details.projectManager ?? NOT_RECORDED}</td>
          </tr>
          <tr>
            <th scope="row">Permit number</th>
            <td>{details.permitNumber ?? "Not yet assigned"}</td>
          </tr>
          <tr>
            <th scope="row">Application filed</th>
            <td>{details.applicationFiledOn ?? "Not yet filed"}</td>
          </tr>
          <tr>
            <th scope="row">Target decision date</th>
            <td>{details.targetDecisionOn ?? NOT_RECORDED}</td>
          </tr>
          {profileVersionNumber === null ? null : (
            <tr>
              <th scope="row">City profile</th>
              <td>Version {profileVersionNumber}</td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}

/** Overview: the rules and boundaries the analysis used. */
export function RulesSection({ run }: { run: Pick<RunContent, "profileDocument" | "rulesResolvedFor"> }) {
  const { profileDocument, rulesResolvedFor } = run;
  return (
    <>
      <h2>Rules and boundaries this document uses</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">Rule set</th>
            <th scope="col">Rules resolved for</th>
            <th scope="col">Why</th>
          </tr>
        </thead>
        <tbody>
          {profileDocument.settings.vesting.map((v) => (
            <tr key={v.ruleSet}>
              <th scope="row">{v.ruleSet === "critical-areas" ? "Critical areas" : "Trees"}</th>
              <td>{rulesResolvedFor[v.ruleSet] ?? NOT_RECORDED}</td>
              <td>
                {v.vests
                  ? "The city's profile says this rule set vests to the application's filing date."
                  : "The city's profile says this rule set does not vest, so the rules in force on that date apply."}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <table>
        <thead>
          <tr>
            <th scope="col">Resource type</th>
            <th scope="col">Map status</th>
          </tr>
        </thead>
        <tbody>
          {profileDocument.resourceTypes.map((r) => (
            <tr key={r.key}>
              <th scope="row">{r.label}</th>
              <td>
                {r.mapStatus === "regulatory"
                  ? "Regulatory boundary"
                  : "Approximate boundary; a site-specific study sets the regulated boundary"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function MapSvg({
  idPrefix,
  title,
  description,
  studyAreaSvg,
  footprintSvg,
}: {
  idPrefix: string;
  title: string;
  description: string;
  studyAreaSvg: GeometrySvg;
  footprintSvg: GeometrySvg | null;
}) {
  return (
    <svg viewBox={mapViewBox(studyAreaSvg, footprintSvg)} role="img" aria-labelledby={`${idPrefix}-title ${idPrefix}-desc`}>
      <title id={`${idPrefix}-title`}>{title}</title>
      <desc id={`${idPrefix}-desc`}>{description}</desc>
      <path d={studyAreaSvg.path} fill="none" stroke="black" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      {footprintSvg ? <path d={footprintSvg.path} fill="none" stroke="red" strokeWidth="2" vectorEffect="non-scaling-stroke" /> : null}
    </svg>
  );
}

/** Site: the study area, drawn to scale. */
export function SiteSection({ summary, studyAreaSvg }: { summary: SectionSummary; studyAreaSvg: GeometrySvg }) {
  return (
    <>
      <h2>Site</h2>
      <Summary summary={summary} />
      <MapSvg
        idPrefix="site-map"
        title="Study area"
        description="The project's study area boundary in black. Drawn to scale in the city's planar coordinate system."
        studyAreaSvg={studyAreaSvg}
        footprintSvg={null}
      />
    </>
  );
}

/** Footprint: the traced proposal footprint over the study area. */
export function FootprintSection({
  summary,
  studyAreaSvg,
  footprintSvg,
}: {
  summary: SectionSummary;
  studyAreaSvg: GeometrySvg;
  footprintSvg: GeometrySvg | null;
}) {
  return (
    <>
      <h2>Footprint</h2>
      <Summary summary={summary} />
      <MapSvg
        idPrefix="footprint-map"
        title="Study area and footprint"
        description="The project's study area boundary in black, and the traced proposal footprint in red if one has been saved. Drawn to scale in the city's planar coordinate system."
        studyAreaSvg={studyAreaSvg}
        footprintSvg={footprintSvg}
      />
    </>
  );
}

/** Evidence: what the public record shows, where sources disagree, and the planner's reasoning. */
export function EvidenceSection({ summary, run }: { summary: SectionSummary; run: RunContent }) {
  const { results, profileDocument } = run;
  const titleOf = (versionId: string): string => run.datasetTitles.get(versionId) ?? versionId;
  return (
    <>
      <h2>Evidence base</h2>
      <Summary summary={summary} />
      <p>
        What the public record shows for this study area, and what it doesn&apos;t. A resource type with nothing
        mapped is a statement about the mapped data, not about the land.
      </p>
      {results.evidenceBase.gaps.length > 0 ? (
        <ul>
          {results.evidenceBase.gaps.map((g) => (
            <li key={`${g.resourceType}:${g.reason}`}>
              {labelOf(profileDocument, g.resourceType)}: {describeScreeningGap(g.reason)}
            </li>
          ))}
        </ul>
      ) : null}
      {results.evidenceBase.disagreements.length > 0 ? (
        <>
          <h3>Where sources disagree</h3>
          <ul>
            {results.evidenceBase.disagreements.map((d) => (
              <li key={`${d.resourceType}:${d.mappedBy}:${d.notMappedBy}`}>
                {labelOf(profileDocument, d.resourceType)}: {formatSqFt(d.area)} is mapped by {titleOf(d.mappedBy)} and not by{" "}
                {titleOf(d.notMappedBy)}.
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {run.resolutions.length > 0 ? (
        <>
          <h3>Sources the planner relies on</h3>
          <p className="note">A recorded reason never changes a measurement; both sources stay shown above.</p>
          <table>
            <thead>
              <tr>
                <th scope="col">Resource type</th>
                <th scope="col">Sources compared</th>
                <th scope="col">Relied on</th>
                <th scope="col">Reason, in the planner&apos;s words</th>
                <th scope="col">Recorded by</th>
              </tr>
            </thead>
            <tbody>
              {run.resolutions.map((r) => (
                <tr key={`${r.resourceType}:${r.mappedByTitle}:${r.notMappedByTitle}:${r.revision}`}>
                  <th scope="row">{labelOf(profileDocument, r.resourceType)}</th>
                  <td>
                    {r.mappedByTitle} and {r.notMappedByTitle}
                  </td>
                  <td>{RELIED_ON_TEXT[r.reliedOn]}</td>
                  <td>{r.rationale}</td>
                  <td>
                    {r.createdByName}, {formatTimestamp(r.createdAt, run.timeZone)} (revision {r.revision})
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </>
  );
}

/** Screening: what mapped data shows in and near the study area, and where it has none. */
export function ScreeningSection({ summary, run }: { summary: SectionSummary; run: RunContent }) {
  const { results, profileDocument } = run;
  const titleOf = (versionId: string): string => run.datasetTitles.get(versionId) ?? versionId;
  const gapsByResource = new Map(results.evidenceBase.gaps.map((g) => [g.resourceType, g.reason] as const));
  return (
    <>
      <h2>Screening register</h2>
      <Summary summary={summary} />
      <p>{SCREENING_CANNOT_SEE}</p>
      <table>
        <thead>
          <tr>
            <th scope="col">Resource type</th>
            <th scope="col">Finding</th>
            <th scope="col">Source</th>
            <th scope="col">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {results.screening.map((row) => {
            const found = run.datasetProvenance.get(row.datasetVersionId);
            if (!found) throw new Error(`no provenance was loaded for dataset version ${row.datasetVersionId}`);
            const provenance = formatEvidenceProvenance(found);
            return (
              <tr key={`${row.resourceType}:${row.datasetVersionId}`}>
                <th scope="row">{labelOf(profileDocument, row.resourceType)}</th>
                <td>{describeScreeningRow(row)}</td>
                <td>
                  {titleOf(row.datasetVersionId)}. {provenance.sourceLine}. {provenance.retrievedLine}
                </td>
                <td>{provenance.confidenceLine}</td>
              </tr>
            );
          })}
          {[...gapsByResource.entries()].map(([resourceType, reason]) => (
            <tr key={`gap:${resourceType}`}>
              <th scope="row">{labelOf(profileDocument, resourceType)}</th>
              <td>{describeScreeningGap(reason)}</td>
              <td>—</td>
              <td>Not applicable — no data.</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** Studies: each study the profile names, and whether mapped data flags it (F14 R6). */
export function StudiesSection({ summary, run }: { summary: SectionSummary; run: RunContent }) {
  const { results, profileDocument } = run;
  const namedStudies = [...new Set(profileDocument.studyTriggers.map((t) => t.study))];
  const flagsByStudy = (study: string) => results.studyFlags.filter((f) => f.study === study);
  return (
    <>
      <h2>Studies</h2>
      <Summary summary={summary} />
      <ul>
        {namedStudies.map((study) => {
          const flags = flagsByStudy(study);
          return (
            <li key={study}>
              <strong>{STUDY_LABEL[study]}:</strong>{" "}
              {flags.length > 0
                ? flags
                    .map((f) => {
                      const rule = findRuleCitation(profileDocument, f.triggerKey);
                      const cite = rule ? ` (${formatRuleProvenance({ ...rule.citation, effectiveOn: rule.effectiveOn }).citations.join("; ")})` : "";
                      return `flagged by ${labelOf(profileDocument, f.resourceType)}${f.approximate ? " (approximate boundary)" : ""}${cite}`;
                    })
                    .join("; ") + "."
                : `${STUDY_NOT_FLAGGED}`}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function ImpactRow({
  impact,
  provenance,
  resourceLabel,
}: {
  impact: Impact;
  provenance: DerivedProvenance | undefined;
  resourceLabel: string;
}) {
  const formatted = provenance ? formatDerivedProvenance(provenance) : null;
  return (
    <tr>
      <th scope="row">{resourceLabel}</th>
      <td>{MEASURE_LABEL[impact.measure]}</td>
      <td>
        {formatImpactQuantity(impact)}
        {impact.dependsOn ? ` (depends on ${impact.dependsOn})` : ""}
        {impact.approximate ? " (approximate boundary)" : ""}
      </td>
      <td>{formatted?.sourceLine ?? "—"}</td>
      <td>{formatted?.confidenceLine ?? CONFIDENCE_NOT_APPLICABLE}</td>
      <td>{formatted?.citations.join("; ") ?? "—"}</td>
    </tr>
  );
}

/** Impact: what the footprint would remove or disturb, and the limits that apply to every figure. */
export function ImpactSection({ summary, run }: { summary: SectionSummary; run: RunContent }) {
  const { results, profileDocument } = run;
  return (
    <>
      <h2>Impact</h2>
      <Summary summary={summary} />
      {results.impacts.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th scope="col">Resource type</th>
              <th scope="col">Measure</th>
              <th scope="col">Quantity</th>
              <th scope="col">Source</th>
              <th scope="col">Confidence</th>
              <th scope="col">Rule citation</th>
            </tr>
          </thead>
          <tbody>
            {results.impacts.map((impact) => (
              <ImpactRow
                key={impact.impactKey}
                impact={impact}
                resourceLabel={labelOf(profileDocument, impact.resourceType)}
                provenance={run.impactProvenance.get(impact.impactKey)}
              />
            ))}
          </tbody>
        </table>
      ) : (
        <p>
          No mapped resource or buffer overlaps the footprint. This describes the mapped data, not a finding about the
          site.
        </p>
      )}

      <h2>What desk analysis can&apos;t see</h2>
      <ul>
        {results.limits.map((limit) => (
          <li key={`${limit.key}:${limit.resourceType ?? ""}:${limit.datasetVersionId ?? ""}`}>
            {describeLimit(limit, {
              resourceLabel: limit.resourceType ? labelOf(profileDocument, limit.resourceType) : null,
              datasetLimitation: limit.datasetVersionId ? (run.datasetLimitations.get(limit.datasetVersionId) ?? null) : null,
            })}
          </li>
        ))}
        <li>A stream, wetland, or other feature that no dataset records will not appear in any table above.</li>
      </ul>
    </>
  );
}
