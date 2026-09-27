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

import type { PhaseKey, ReportPhase, ReportSnapshot } from "./snapshot";

// TechDesign/locked-report.md — the document's React tree. Server Components only; never interactive
// (D12: printed by Playwright, not screenshotted). Every prop is already-resolved, pinned data: nothing
// here fetches, and nothing reads "current" (F22 R11). No prop carries a judgment, a recommendation, or
// free text a future change could repurpose for one (R6): the only free text is the planner's own reason
// and review notes, printed in labeled places as the planner's words, never as UPlan's finding (see the
// denylist check in document.test.ts).

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

const APPLICATION_TYPE_LABEL = {
  subdivision: "Subdivision",
  short_subdivision: "Short subdivision",
  clearing_grading: "Clearing and grading",
} as const;

const PHASE_TITLE: Record<PhaseKey, string> = {
  site: "Site",
  evidence: "Evidence",
  screening: "Screening",
  studies: "Studies",
  footprint: "Footprint",
  impact: "Impact",
};

const RELIED_ON_TEXT = {
  mapped_by: "the first source",
  not_mapped_by: "the second source",
  neither: "neither source",
} as const;

// Tables/typography only — globals.css's comment ("the report has its own print stylesheet")
// pointed here; this is that stylesheet, kept in the same file as the markup it styles since the
// report is printed by Playwright standalone, never loaded alongside the interactive app's CSS.
const PRINT_STYLES = `
  @page { size: letter; margin: 0.75in; }
  body { font-family: Georgia, "Times New Roman", serif; color: #1a1a1a; line-height: 1.5; font-size: 11pt; }
  h1 { font-size: 22pt; margin-bottom: 0.2em; }
  h2 { font-size: 14pt; margin-top: 1.6em; border-bottom: 1px solid #999; padding-bottom: 0.25em; break-after: avoid; }
  h3 { font-size: 12pt; margin-top: 1.1em; break-after: avoid; }
  table { width: 100%; border-collapse: collapse; margin-top: 0.5em; font-size: 10pt; }
  th, td { border: 1px solid #999; padding: 0.4em 0.6em; text-align: left; vertical-align: top; }
  th[scope="col"] { background: #ececec; }
  th[scope="row"] { background: #f6f6f6; font-weight: 600; width: 28%; }
  svg { max-width: 100%; height: auto; border: 1px solid #999; }
  tr { break-inside: avoid; }
  .banner { border: 2px solid #1a1a1a; padding: 0.6em 0.9em; margin: 0.8em 0; }
  .meta { color: #444; margin: 0.2em 0; }
  .note { color: #444; font-size: 9.5pt; }
  ul { margin: 0.4em 0; padding-left: 1.3em; }
`;

const NOT_RECORDED = "Not yet recorded";

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

function Summary({ phase }: { phase: ReportPhase }): ReactNode {
  return (
    <>
      <p>
        <strong>{phase.summary.headline}</strong>
      </p>
      <ul>
        {phase.summary.lines.map((line, i) => (
          <li key={`${i}:${line}`}>{line}</li>
        ))}
      </ul>
      <p className="note">Drafted by UPlan&apos;s analysis engine from measurements. No language model wrote this.</p>
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

export function ReportDocument(props: ReportDocumentProps) {
  const { snapshot, results, profileDocument } = props;
  const details = snapshot.details;
  const label = (resourceType: string): string =>
    profileDocument.resourceTypes.find((r) => r.key === resourceType)?.label ?? resourceType;
  const phaseOf = (key: PhaseKey): ReportPhase => {
    const found = snapshot.phases.find((p) => p.phase === key);
    if (!found) throw new Error(`the snapshot has no ${key} phase`);
    return found;
  };
  const provenanceOf = (versionId: string): EvidenceProvenance => {
    const found = props.datasetProvenance.get(versionId);
    if (!found) throw new Error(`no provenance was loaded for dataset version ${versionId}`);
    return found;
  };
  const titleOf = (versionId: string): string => props.datasetTitles.get(versionId) ?? versionId;
  const when = (instant: Date | string): string => formatTimestamp(instant, props.timeZone);

  // The studies the profile names, once each, in the order the flags and triggers give (F14 R6).
  const namedStudies = [...new Set(profileDocument.studyTriggers.map((t) => t.study))];
  const flagsByStudy = (study: string) => results.studyFlags.filter((f) => f.study === study);

  // R14: every rule any figure cites, once.
  const citedRuleKeys = [...new Set([...results.impacts.flatMap((i) => i.ruleKeys), ...results.studyFlags.flatMap((f) => f.ruleKeys)])].sort();
  const pinnedVersionIds = [...props.datasetProvenance.keys()].sort();

  const gapsByResource = new Map(results.evidenceBase.gaps.map((g) => [g.resourceType, g.reason] as const));

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>
          {details.title} — UPlan document, version {props.versionNumber}
        </title>
        {/* Print-only, presentational styling (D12, D20) — no text content, so it can never carry a
            judgment; document.test.ts's denylist only ever checks rendered text, not this markup. */}
        <style>{PRINT_STYLES}</style>
      </head>
      <body>
        <h1>{details.title}</h1>
        <p className="meta">
          {props.cityName}, {props.stateCode} · Version {props.versionNumber} · Research finished{" "}
          {when(props.requestedAt)}
        </p>
        {details.usesSampleData ? (
          <p className="banner" role="note">
            <strong>Sample data.</strong> This document was built from sample data. It does not describe a real
            site, applicant, or source.
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
            <tr>
              <th scope="row">City profile</th>
              <td>Version {props.profileVersionNumber}</td>
            </tr>
          </tbody>
        </table>

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
                <td>{props.rulesResolvedFor[v.ruleSet] ?? NOT_RECORDED}</td>
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

        {snapshot.previousVersion !== null ? (
          <>
            <h2>What changed since version {snapshot.previousVersion}</h2>
            <p>
              <strong>Reason given by the planner:</strong> {props.changeNote ?? NOT_RECORDED}
            </p>
            <ul>
              {snapshot.phases
                .filter((p) => p.changed)
                .map((p) => (
                  <li key={p.phase}>The {PHASE_TITLE[p.phase]} phase&apos;s output changed and was reviewed again.</li>
                ))}
              {snapshot.detailsChanged ? <li>The project details changed.</li> : null}
              {!snapshot.detailsChanged && snapshot.phases.every((p) => !p.changed) ? (
                <li>No phase output or project detail differs from the previous version.</li>
              ) : null}
            </ul>
          </>
        ) : null}

        <h2>Site and footprint</h2>
        <Summary phase={phaseOf("site")} />
        <svg viewBox={mapViewBox(props.studyAreaSvg, props.footprintSvg)} role="img" aria-labelledby="map-title map-desc">
          <title id="map-title">Study area and footprint</title>
          <desc id="map-desc">
            The project&apos;s study area boundary in black, and the traced proposal footprint in red if one has been
            saved. Drawn to scale in the city&apos;s planar coordinate system.
          </desc>
          <path d={props.studyAreaSvg.path} fill="none" stroke="black" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          {props.footprintSvg ? (
            <path d={props.footprintSvg.path} fill="none" stroke="red" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          ) : null}
        </svg>
        <Summary phase={phaseOf("footprint")} />

        <h2>Evidence base</h2>
        <Summary phase={phaseOf("evidence")} />
        <p>
          What the public record shows for this study area, and what it doesn&apos;t. A resource type with
          nothing mapped is a statement about the mapped data, not about the land.
        </p>
        {results.evidenceBase.gaps.length > 0 ? (
          <ul>
            {results.evidenceBase.gaps.map((g) => (
              <li key={`${g.resourceType}:${g.reason}`}>
                {label(g.resourceType)}: {describeScreeningGap(g.reason)}
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
                  {label(d.resourceType)}: {formatSqFt(d.area)} is mapped by {titleOf(d.mappedBy)} and not by{" "}
                  {titleOf(d.notMappedBy)}.
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {props.resolutions.length > 0 ? (
          <>
            <h3>Sources the planner relies on</h3>
            <p className="note">
              A recorded reason never changes a measurement; both sources stay shown above.
            </p>
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
                {props.resolutions.map((r) => (
                  <tr key={`${r.resourceType}:${r.mappedByTitle}:${r.notMappedByTitle}:${r.revision}`}>
                    <th scope="row">{label(r.resourceType)}</th>
                    <td>
                      {r.mappedByTitle} and {r.notMappedByTitle}
                    </td>
                    <td>{RELIED_ON_TEXT[r.reliedOn]}</td>
                    <td>{r.rationale}</td>
                    <td>
                      {r.createdByName}, {when(r.createdAt)} (revision {r.revision})
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}

        <h2>Screening register</h2>
        <Summary phase={phaseOf("screening")} />
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
              const provenance = formatEvidenceProvenance(provenanceOf(row.datasetVersionId));
              return (
                <tr key={`${row.resourceType}:${row.datasetVersionId}`}>
                  <th scope="row">{label(row.resourceType)}</th>
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
                <th scope="row">{label(resourceType)}</th>
                <td>{describeScreeningGap(reason)}</td>
                <td>—</td>
                <td>Not applicable — no data.</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>Studies</h2>
        <Summary phase={phaseOf("studies")} />
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
                        return `flagged by ${label(f.resourceType)}${f.approximate ? " (approximate boundary)" : ""}${cite}`;
                      })
                      .join("; ") + "."
                  : `${STUDY_NOT_FLAGGED}`}
              </li>
            );
          })}
        </ul>

        <h2>Impact</h2>
        <Summary phase={phaseOf("impact")} />
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
                  resourceLabel={label(impact.resourceType)}
                  provenance={props.impactProvenance.get(impact.impactKey)}
                />
              ))}
            </tbody>
          </table>
        ) : (
          <p>
            No mapped resource or buffer overlaps the footprint. This describes the mapped data, not a finding about
            the site.
          </p>
        )}

        <h2>What desk analysis can&apos;t see</h2>
        <ul>
          {results.limits.map((limit) => (
            <li key={`${limit.key}:${limit.resourceType ?? ""}:${limit.datasetVersionId ?? ""}`}>
              {describeLimit(limit, {
                resourceLabel: limit.resourceType ? label(limit.resourceType) : null,
                datasetLimitation: limit.datasetVersionId ? (props.datasetLimitations.get(limit.datasetVersionId) ?? null) : null,
              })}
            </li>
          ))}
          <li>A stream, wetland, or other feature that no dataset records will not appear in any table above.</li>
        </ul>

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

        <h2>Review record</h2>
        <p className="note">
          Each phase was reviewed by the planner before this version was published. A review is the planner&apos;s
          own record that they read that output; it is not a sign-off by anyone else.
        </p>
        <table>
          <thead>
            <tr>
              <th scope="col">Phase</th>
              <th scope="col">Reviewed by</th>
              <th scope="col">When</th>
              <th scope="col">Note, in the reviewer&apos;s words</th>
              <th scope="col">Output fingerprint</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.phases.map((p) => (
              <tr key={p.phase}>
                <th scope="row">{PHASE_TITLE[p.phase]}</th>
                <td>{p.reviewedByName}</td>
                <td>{when(p.reviewedAt)}</td>
                <td>{p.note ?? "—"}</td>
                <td>{p.contentSha256.slice(0, 12)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </body>
    </html>
  );
}
