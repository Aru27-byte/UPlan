import Link from "next/link";

import { phaseModel } from "@/app/_lib/phase-model";
import { loadProject } from "@/app/_lib/project";
import { projectHref } from "@/app/_lib/workflow-labels";
import {
  describeScreeningGap,
  listResolutions,
  matchResolutions,
  todayInZone,
  type Disagreement,
  type EvidenceResolution,
} from "@/modules/analysis";
import {
  getDatasetVersionAttributes,
  getDatasetVersionProvenance,
  getDatasetVersionQuality,
  getJurisdictionDatasetMappings,
  type DatasetVersionQuality,
} from "@/modules/evidence";
import {
  formatEvidenceAttributes,
  formatEvidenceProvenance,
  formatSqFt,
  formatTimestamp,
  type AttributeLine,
  type ConfidenceLevel,
  type EvidenceConsistency,
  type FormattedProvenance,
} from "@/modules/provenance";
import { Panel } from "@/ui/panel";
import { PhasePage } from "@/ui/phase/phase-page";
import { StatusLabel, type StatusTone } from "@/ui/status-label";

import { recordReviewAction } from "../actions";
import { ResolutionForm } from "../_components/resolution-form";

const CONFIDENCE_TONE: Record<ConfidenceLevel, StatusTone> = { high: "ok", moderate: "info", low: "warn" };

type Source = {
  datasetVersionId: string;
  title: string;
  provenance: FormattedProvenance;
  confidence: ConfidenceLevel;
  attributes: AttributeLine[];
  quality: DatasetVersionQuality;
};

// Phase 2 (F19, research-phases.md): the evidence base for the study area, one card per resource type in the
// city's profile, with the seven facts behind each confidence label, both sources wherever two disagree, and
// the planner's recorded reasoning about each disagreement. A resolution is a note: it changes no number.
export default async function EvidencePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { actor, workflow: w } = await loadProject(projectId);
  const model = phaseModel(w, projectId, "evidence");
  const { run, rules } = w.facts;
  const reviewAction = recordReviewAction.bind(null, projectId);

  // Without a run for the current inputs there is no evidence base to show: the drafted output says why.
  if (!run || !rules) return <PhasePage model={model} reviewAction={reviewAction} />;

  const today = todayInZone(w.timeZone, () => new Date());
  const [mappings, allResolutions] = await Promise.all([
    getJurisdictionDatasetMappings(w.decision.jurisdictionId),
    listResolutions(actor, projectId),
  ]);
  const match = matchResolutions(run.results.evidenceBase.disagreements, w.facts.resolutions);
  const readOnly = w.decisionStatus !== "in_progress";

  const cards = await Promise.all(
    rules.resourceTypes.map(async (resourceType) => {
      const disagreements = match.disagreements.filter((m) => m.disagreement.resourceType === resourceType.key);
      const mapped = mappings.filter((m) => m.resourceTypeKey === resourceType.key && m.dataset.currentVersionId);
      const consistency: EvidenceConsistency =
        disagreements.length > 0 ? "disagree" : mapped.length >= 2 ? "agree" : "single-source";
      const sources: Source[] = await Promise.all(
        mapped.map(async (m): Promise<Source> => {
          // A mapping with no current version is filtered out above, so this is always set.
          const datasetVersionId = m.dataset.currentVersionId;
          if (!datasetVersionId) throw new Error(`dataset ${m.dataset.key} has no current version`);
          const [provenanceRaw, attributes, quality] = await Promise.all([
            getDatasetVersionProvenance(datasetVersionId),
            getDatasetVersionAttributes(datasetVersionId),
            getDatasetVersionQuality(datasetVersionId),
          ]);
          return {
            datasetVersionId,
            title: m.dataset.title,
            provenance: formatEvidenceProvenance(provenanceRaw),
            confidence: provenanceRaw.confidence,
            attributes: formatEvidenceAttributes(attributes, { today, mapStatus: resourceType.mapStatus, consistency }),
            quality,
          };
        }),
      );
      return {
        resourceType,
        gap: run.results.evidenceBase.gaps.find((g) => g.resourceType === resourceType.key) ?? null,
        sources,
        disagreements,
      };
    }),
  );

  // Every version a disagreement names is one the run pinned, so its title was read with the run.
  const titleOf = (versionId: string): string => {
    const title = w.facts.datasetTitles.get(versionId);
    if (title === undefined) throw new Error(`dataset version ${versionId} is not one the analysis pinned`);
    return title;
  };

  return (
    <PhasePage model={model} reviewAction={reviewAction}>
      <div className="flex flex-col gap-4">
        {cards.map(({ resourceType, gap, sources, disagreements }) => (
          <Panel
            key={resourceType.key}
            headingLevel={3}
            title={resourceType.label}
            description={
              resourceType.mapStatus === "approximate"
                ? "Approximate boundary: a site study sets the regulated boundary."
                : "Regulatory boundary."
            }
          >
            {gap ? (
              <p className="text-sm text-text">{describeScreeningGap(gap.reason)}</p>
            ) : sources.length === 0 ? (
              <p className="text-sm text-text">No evidence is recorded for this resource type.</p>
            ) : (
              <div className="flex flex-col gap-5">
                {sources.map((source) => (
                  <SourceBlock key={source.datasetVersionId} projectId={projectId} source={source} timeZone={w.timeZone} />
                ))}
              </div>
            )}

            {disagreements.length > 0 ? (
              <div className="mt-5 flex flex-col gap-4 border-t border-line pt-4">
                <h4 className="text-sm font-semibold text-text">Where sources disagree</h4>
                {disagreements.map(({ disagreement, resolution }) => (
                  <DisagreementBlock
                    key={`${disagreement.mappedBy}:${disagreement.notMappedBy}`}
                    projectId={projectId}
                    disagreement={disagreement}
                    resolution={resolution}
                    history={allResolutions.filter(
                      (r) =>
                        r.resourceTypeKey === disagreement.resourceType &&
                        r.mappedBy === disagreement.mappedBy &&
                        r.notMappedBy === disagreement.notMappedBy,
                    )}
                    actorId={actor.userId}
                    titleOf={titleOf}
                    timeZone={w.timeZone}
                    readOnly={readOnly}
                  />
                ))}
              </div>
            ) : null}
          </Panel>
        ))}

        {match.recordedForEarlierData.length > 0 ? (
          <Panel headingLevel={3} title="Recorded for earlier data">
            <p className="mb-3 text-sm text-muted">
              These notes were recorded about a pair of dataset versions this analysis no longer uses. They are not
              carried over to the current data.
            </p>
            <ul className="flex flex-col gap-2 text-sm text-text">
              {match.recordedForEarlierData.map((r) => (
                <li key={`${r.resourceTypeKey}:${r.mappedBy}:${r.notMappedBy}`}>
                  <span className="font-medium">{r.resourceTypeKey}</span>: “{r.rationale}” (revision {r.revision},{" "}
                  {formatTimestamp(r.createdAt, w.timeZone)})
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}
      </div>
    </PhasePage>
  );
}

function SourceBlock({ projectId, source, timeZone }: { projectId: string; source: Source; timeZone: string }) {
  const q = source.quality;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold text-text">{source.title}</h4>
        <StatusLabel tone={CONFIDENCE_TONE[source.confidence]}>
          {source.confidence.charAt(0).toUpperCase()}
          {source.confidence.slice(1)} confidence
        </StatusLabel>
        {q.isSample ? <StatusLabel tone="warn">Sample data</StatusLabel> : null}
        <Link
          href={`${projectHref(projectId, "site")}?layer=${source.datasetVersionId}#map-workspace`}
          className="ml-auto text-sm font-medium text-brand underline-offset-2 hover:underline"
        >
          Show on map
        </Link>
      </div>
      <p className="mt-1 text-sm text-text">{source.provenance.sourceLine}</p>
      <p className="text-sm text-muted">{source.provenance.retrievedLine}</p>
      {source.provenance.confidenceLine ? <p className="text-sm text-muted">{source.provenance.confidenceLine}</p> : null}

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {source.attributes.map((line) => (
          <div key={line.label} className="contents">
            <dt className="font-medium text-muted">{line.label}</dt>
            <dd className="text-text">{line.value}</dd>
          </div>
        ))}
      </dl>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer rounded font-medium text-brand">Data quality</summary>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="font-medium text-muted">Dataset</dt>
          <dd className="text-text">
            {q.datasetTitle} ({q.datasetKey})
          </dd>
          <dt className="font-medium text-muted">Retrieved by UPlan</dt>
          <dd className="text-text">{formatTimestamp(q.retrievedAt, timeZone)}</dd>
          <dt className="font-medium text-muted">Publisher&apos;s date</dt>
          <dd className="text-text">{q.sourceAsOfOn ?? `Not given: ${q.sourceAsOfNote ?? "no note recorded"}`}</dd>
          <dt className="font-medium text-muted">Features</dt>
          <dd className="text-text">{q.featureCount ?? "Not recorded"}</dd>
          <dt className="font-medium text-muted">Geometry repairs at ingestion</dt>
          <dd className="text-text">{q.repairedGeometryCount}</dd>
          <dt className="font-medium text-muted">Known limitation</dt>
          <dd className="text-text">{q.knownLimitation ?? "None recorded"}</dd>
        </dl>
      </details>
    </div>
  );
}

function DisagreementBlock({
  projectId,
  disagreement,
  resolution,
  history,
  actorId,
  titleOf,
  timeZone,
  readOnly,
}: {
  projectId: string;
  disagreement: Disagreement;
  resolution: EvidenceResolution | null;
  history: EvidenceResolution[];
  actorId: string;
  titleOf: (versionId: string) => string;
  timeZone: string;
  readOnly: boolean;
}) {
  const mappedBy = titleOf(disagreement.mappedBy);
  const notMappedBy = titleOf(disagreement.notMappedBy);
  const reliedOnText = (r: EvidenceResolution) =>
    r.reliedOn === "mapped_by"
      ? `relies on ${mappedBy}`
      : r.reliedOn === "not_mapped_by"
        ? `relies on ${notMappedBy}`
        : "relies on neither source";
  const by = (r: EvidenceResolution) => (r.createdBy === actorId ? "you" : "another person");
  const nextRevision = (history.at(-1)?.revision ?? 0) + 1;

  return (
    <div className="rounded-lg border border-line bg-canvas p-4 text-sm">
      <p className="text-text">
        <span className="font-medium">{mappedBy}</span> maps {formatSqFt(disagreement.area)} that{" "}
        <span className="font-medium">{notMappedBy}</span> does not. Both sources stay shown; UPlan doesn&apos;t choose
        between them.
      </p>

      {resolution ? (
        <p className="mt-2 text-text">
          <span className="font-semibold">Your reasoning:</span> the planner {reliedOnText(resolution)} — “
          {resolution.rationale}” (revision {resolution.revision}, recorded by {by(resolution)},{" "}
          {formatTimestamp(resolution.createdAt, timeZone)}). This note changes no measurement.
        </p>
      ) : (
        <p className="mt-2 text-muted">Not yet recorded for the current data.</p>
      )}

      {history.length > 1 ? (
        <details className="mt-2">
          <summary className="cursor-pointer rounded font-medium text-brand">Earlier revisions</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-text">
            {history
              .slice(0, -1)
              .reverse()
              .map((r) => (
                <li key={r.revision}>
                  Revision {r.revision}: {reliedOnText(r)} — “{r.rationale}” ({formatTimestamp(r.createdAt, timeZone)})
                </li>
              ))}
          </ul>
        </details>
      ) : null}

      {readOnly ? null : (
        <ResolutionForm
          projectId={projectId}
          disagreement={disagreement}
          mappedByTitle={mappedBy}
          notMappedByTitle={notMappedBy}
          expectedRevision={nextRevision}
          isRevision={resolution !== null}
        />
      )}
    </div>
  );
}
