import {
  formatDerivedProvenance,
  CONFIDENCE_NOT_APPLICABLE,
  type DerivedProvenance,
} from "@/modules/provenance";
import type { AnalysisResults, Impact } from "@/modules/analysis";
import type { ProfileDocument } from "@/modules/profiles";

// TechDesign/locked-report.md — the report's React tree. Server Components only; never interactive
// (D12: printed by Playwright, not screenshotted). No prop here ever carries a judgment, a
// recommendation, or free text a future change could repurpose for one (R6 of locked-report.md;
// see the denylist check in document.test.ts).

export type ReportDocumentProps = {
  decisionTitle: string;
  permitNumber: string | null;
  jurisdictionName: string;
  applicationFiledOn: string | null;
  profileDocument: ProfileDocument;
  results: AnalysisResults;
  impactProvenance: Map<string, DerivedProvenance>; // keyed by Impact.impactKey
  studyAreaSvgPath: string;
  footprintSvgPath: string | null;
};

// Tables/typography only — globals.css's comment ("the report has its own print stylesheet")
// pointed here; this is that stylesheet, kept in the same file as the markup it styles since the
// report is printed by Playwright standalone, never loaded alongside the interactive app's CSS.
const PRINT_STYLES = `
  @page { size: letter; margin: 0.75in; }
  body { font-family: Georgia, "Times New Roman", serif; color: #1a1a1a; line-height: 1.5; }
  h1 { font-size: 20pt; margin-bottom: 0.25em; }
  h2 { font-size: 14pt; margin-top: 1.5em; border-bottom: 1px solid #999; padding-bottom: 0.25em; }
  h3 { font-size: 12pt; margin-top: 1em; }
  table { width: 100%; border-collapse: collapse; margin-top: 0.5em; font-size: 10pt; }
  th, td { border: 1px solid #999; padding: 0.4em 0.6em; text-align: left; vertical-align: top; }
  th[scope="col"] { background: #ececec; }
  svg { max-width: 100%; height: auto; border: 1px solid #999; }
  tr { break-inside: avoid; }
`;

function ImpactRow({ impact, provenance }: { impact: Impact; provenance: DerivedProvenance | undefined }) {
  const formatted = provenance ? formatDerivedProvenance(provenance) : null;
  const range =
    impact.min === impact.max
      ? `${impact.min.toFixed(1)}`
      : `${impact.min.toFixed(1)}–${impact.max.toFixed(1)} (depends on ${impact.dependsOn})`;
  return (
    <tr>
      <th scope="row">{impact.resourceType}</th>
      <td>{impact.measure}</td>
      <td>
        {range} {impact.unit}
        {impact.approximate ? " (approximate boundary)" : ""}
      </td>
      <td>{formatted?.sourceLine ?? "—"}</td>
      <td>{formatted?.confidenceLine ?? CONFIDENCE_NOT_APPLICABLE}</td>
      <td>{formatted?.citations.join("; ") ?? "—"}</td>
    </tr>
  );
}

export function ReportDocument(props: ReportDocumentProps) {
  const {
    decisionTitle,
    permitNumber,
    jurisdictionName,
    applicationFiledOn,
    results,
    impactProvenance,
    studyAreaSvgPath,
    footprintSvgPath,
  } = props;

  return (
    <html lang="en">
      <head>
        <title>{decisionTitle} — UPlan report</title>
        {/* Print-only, presentational styling (D12, D20) — no text content, so it can never carry a
            judgment; document.test.ts's denylist only ever checks rendered text, not this markup. */}
        <style>{PRINT_STYLES}</style>
      </head>
      <body>
        <h1>{decisionTitle}</h1>
        <p>
          {jurisdictionName} · Permit {permitNumber ?? "not yet assigned"} · Filed{" "}
          {applicationFiledOn ?? "not yet filed"}
        </p>

        <h2>Study area and footprint</h2>
        <svg viewBox="0 0 1000 1000" role="img" aria-labelledby="map-title map-desc">
          <title id="map-title">Study area and footprint</title>
          <desc id="map-desc">
            The decision's study area boundary, and the traced proposal footprint if one has been saved.
          </desc>
          <path d={studyAreaSvgPath} fill="none" stroke="black" />
          {footprintSvgPath ? <path d={footprintSvgPath} fill="none" stroke="red" /> : null}
        </svg>

        <h2>Evidence base</h2>
        <p>
          What the public record shows for this study area, and what it doesn&apos;t (P1/P2 — never a
          clearance).
        </p>
        {results.evidenceBase.gaps.length === 0 ? (
          <p>
            No gaps: every resource type in the current profile has mapped, in-coverage evidence for this
            study area.
          </p>
        ) : (
          <ul>
            {results.evidenceBase.gaps.map((g) => (
              <li key={`${g.resourceType}:${g.reason}`}>
                {g.resourceType}:{" "}
                {g.reason === "no-dataset-mapped"
                  ? "no dataset is mapped for this resource type"
                  : "mapped data does not cover this study area"}
              </li>
            ))}
          </ul>
        )}
        {results.evidenceBase.disagreements.length > 0 ? (
          <>
            <h3>Where sources disagree</h3>
            <ul>
              {results.evidenceBase.disagreements.map((d) => (
                <li key={`${d.resourceType}:${d.mappedBy}:${d.notMappedBy}`}>
                  {d.resourceType}: {d.area.toFixed(1)} sq ft mapped by one source and not another
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <h2>Impact</h2>
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
                provenance={impactProvenance.get(impact.impactKey)}
              />
            ))}
          </tbody>
        </table>

        <h2>What desk analysis can&apos;t see</h2>
        <ul>
          {results.limits.map((l) => (
            <li key={`${l.key}:${l.resourceType ?? ""}`}>
              {l.key === "significant-trees-not-countable"
                ? "The number of individually regulated trees this proposal would remove cannot be determined from remote data."
                : `${l.resourceType}: the mapped boundary is approximate; a site-specific study sets the regulated boundary.`}
            </li>
          ))}
        </ul>
      </body>
    </html>
  );
}
