import Link from "next/link";

import { loadProject } from "@/app/_lib/project";
import {
  NEXT_ACTION_TEXT,
  PHASE_TITLE,
  analysisStatusText,
  projectHref,
  publishedVersion,
} from "@/app/_lib/workflow-labels";
import { STUDY_LABEL, describeLimit, describeScreeningGap, matchResolutions } from "@/modules/analysis";
import type { RuleSet } from "@/modules/profiles";
import { formatFeet, formatRuleProvenance, formatTimestamp } from "@/modules/provenance";
import { actionClassName } from "@/ui/action-styles";
import { ConfirmDialog } from "@/ui/confirm-dialog.client";
import { Icon } from "@/ui/icons";
import { Panel } from "@/ui/panel";
import { StatusLabel } from "@/ui/status-label";

import { cancelResearchChangeAction } from "../actions";
import { DetailsPanel } from "../_components/details-form";

const RULE_SET_LABEL: Record<RuleSet, string> = { "critical-areas": "Critical area rules", trees: "Tree rules" };
const RULE_SETS = ["critical-areas", "trees"] as const satisfies readonly RuleSet[];

// The Overview (TechDesign/decision-overview.md, F18): the planner's five questions answered from the
// project's own records — counts and lists, never a score, a percentage, or a ranking (R5) — plus the rules
// and assumptions the analysis used, the project's details, and (F22) the version and research-change state.
// Every sentence is a fixed template over records; none is written by a model.
export default async function OverviewPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { workflow: w } = await loadProject(projectId);
  const d = w.decision;
  const { run, rules, status } = w.facts;
  const analysis = analysisStatusText(status);

  const labelOf = (key: string): string => {
    const found = rules?.resourceTypes.find((r) => r.key === key);
    if (!found) throw new Error(`the analysis names a resource type the profile lacks: ${key}`);
    return found.label;
  };
  const titleOf = (versionId: string): string => {
    const title = w.facts.datasetTitles.get(versionId);
    if (title === undefined) throw new Error(`dataset version ${versionId} is not one the analysis pinned`);
    return title;
  };

  const gaps = run?.results.evidenceBase.gaps ?? [];
  const gapped = new Set(gaps.map((g) => g.resourceType));
  const known =
    run && rules
      ? rules.resourceTypes
          .filter((r) => !gapped.has(r.key))
          .map((r) => ({
            label: r.label,
            datasets: [...new Set(run.results.screening.filter((s) => s.resourceType === r.key).map((s) => titleOf(s.datasetVersionId)))],
          }))
      : [];
  const unresolved = run
    ? matchResolutions(run.results.evidenceBase.disagreements, w.facts.resolutions).disagreements.filter((m) => m.resolution === null).length
    : 0;
  const approximateNonzero = run
    ? run.results.screening.filter((s) => s.approximate && (s.intersectingFeatureCount > 0 || s.bufferReaches.length > 0))
    : [];

  return (
    <div className="flex flex-col gap-6">
      <Panel title="What next?" description="From the project's records, in order. Each step names a place to work, never a judgment about the development.">
        {w.nextActions.length === 0 ? (
          <p className="text-sm text-text">Nothing is waiting on you.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-line">
            {w.nextActions.map((action, index) => (
              <li key={action.key} className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="text-sm text-text">
                  <span className="mr-2 font-semibold text-muted">{index + 1}.</span>
                  {NEXT_ACTION_TEXT[action.key]}
                  {action.count !== undefined ? ` (${action.count})` : ""}
                </span>
                <Link
                  href={projectHref(projectId, action.step)}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-brand underline-offset-2 hover:underline"
                >
                  Go there
                  <Icon name="arrow-right" />
                </Link>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel headingLevel={3} title="What do we know?" description="Resource types with mapped evidence over the study area.">
          {!run ? (
            <p className="text-sm text-muted">{analysis.text}. {analysis.detail}</p>
          ) : known.length === 0 ? (
            <p className="text-sm text-text">No mapped dataset covers the study area.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm text-text">
              {known.map((k) => (
                <li key={k.label}>
                  <span className="font-medium">{k.label}</span>
                  <span className="text-muted"> — {k.datasets.join(", ")}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel headingLevel={3} title="What don't we know?" description="Gaps, open disagreements, and what desk analysis can't see.">
          {!run ? (
            <p className="text-sm text-muted">{analysis.text}. {analysis.detail}</p>
          ) : (
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-text">
              {gaps.map((g) => (
                <li key={`${g.resourceType}:${g.reason}`}>
                  {labelOf(g.resourceType)}: {describeScreeningGap(g.reason)}
                </li>
              ))}
              {unresolved > 0 ? (
                <li>
                  {unresolved} source {unresolved === 1 ? "disagreement has" : "disagreements have"} no recorded reasoning yet.{" "}
                  <Link href={projectHref(projectId, "evidence")} className="font-medium text-brand underline underline-offset-2">
                    Review them
                  </Link>
                  .
                </li>
              ) : null}
              {run.results.limits.map((limit) => (
                <li key={`${limit.key}:${limit.resourceType ?? ""}:${limit.datasetVersionId ?? ""}`}>
                  {describeLimit(limit, {
                    resourceLabel: limit.resourceType ? labelOf(limit.resourceType) : null,
                    datasetLimitation: limit.datasetVersionId ? (w.facts.datasetLimitations.get(limit.datasetVersionId) ?? null) : null,
                  })}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel headingLevel={3} title="What could delay this?" description="Things that stand between the project and its document.">
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-text">
            {status.kind !== "current" && !(status.kind === "none" && status.reason === "no-study-area") ? (
              <li>
                {analysis.text}. {analysis.detail}
              </li>
            ) : null}
            {d.targetDecisionOn ? <li>Target decision date: {d.targetDecisionOn}.</li> : <li>No target decision date is recorded.</li>}
            {w.decisionStatus === "report_released" ? (
              <li>Version {publishedVersion(w.latestVersion)} of the document is published.</li>
            ) : w.decisionStatus === "finishing" ? (
              <li>The document is being generated.</li>
            ) : (
              <li>{w.latestVersion === null ? "The final document isn't published yet." : "The next version isn't published yet."}</li>
            )}
          </ul>
        </Panel>

        <Panel headingLevel={3} title="What can desk analysis not settle?" description="A screen can add a study, and never removes one.">
          {!run ? (
            <p className="text-sm text-muted">{analysis.text}. {analysis.detail}</p>
          ) : run.results.studyFlags.length === 0 && approximateNonzero.length === 0 ? (
            <p className="text-sm text-text">
              No study is flagged by mapped data, and no approximate boundary reaches the study area. That doesn&apos;t
              waive a study: the city decides which studies an application needs.
            </p>
          ) : (
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-text">
              {run.results.studyFlags.map((f) => (
                <li key={f.triggerKey}>
                  {STUDY_LABEL[f.study]} is flagged by {labelOf(f.resourceType)}
                  {f.nearestDistanceFt === 0 ? "; a mapped feature is inside the study area" : `; the nearest mapped feature is ${formatFeet(f.nearestDistanceFt)} away`}.
                </li>
              ))}
              {approximateNonzero.map((s) => (
                <li key={`${s.resourceType}:${s.datasetVersionId}`}>
                  {labelOf(s.resourceType)}: the mapped boundary is approximate, and a site study sets the regulated boundary.
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {w.versions.length > 0 ? (
        <Panel
          title="Document versions"
          description="Every published version is kept, unchanged."
          actions={
            <Link href={projectHref(projectId, "report")} className={actionClassName("secondary")}>
              Version history
            </Link>
          }
        >
          {w.versions[0] ? (
            <p className="text-sm text-text">
              Latest: <span className="font-semibold">version {w.versions[0].versionNumber}</span>, published{" "}
              {formatTimestamp(w.versions[0].releasedAt, w.timeZone)} by {w.versions[0].publishedByName}.{" "}
              <a
                href={`/api/projects/${projectId}/documents/${w.versions[0].versionNumber}`}
 download
                className="inline-flex items-center gap-1 font-semibold text-brand underline-offset-2 hover:underline"
              >
                <Icon name="download" />
                Download
              </a>
            </p>
          ) : null}
        </Panel>
      ) : null}

      {w.change ? (
        <Panel
          title={`Research change from version ${w.change.baseVersion}`}
          description="What differs from the last published version. A phase whose output is unchanged keeps its review and needs none."
          actions={
            w.decisionStatus === "in_progress" && !w.change.hasChanges ? (
              <ConfirmDialog
                triggerLabel="Cancel research change"
                triggerVariant="secondary"
                title="Cancel this research change?"
                confirmLabel="Cancel research change"
                pendingLabel="Cancelling…"
                action={cancelResearchChangeAction.bind(null, projectId)}
                fields={{ rowVersion: String(d.rowVersion) }}
              >
                Nothing has changed, so version {w.change.baseVersion} becomes the current version again.
              </ConfirmDialog>
            ) : null
          }
        >
          <ul className="flex flex-col divide-y divide-line text-sm">
            {w.change.phases.map((p) => (
              <li key={p.phase} className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                <Link href={projectHref(projectId, p.phase)} className="font-medium text-text underline-offset-2 hover:underline">
                  {PHASE_TITLE[p.phase]}
                </Link>
                <span className="flex flex-wrap items-center gap-2">
                  {p.changed ? <StatusLabel tone="warn">Changed</StatusLabel> : <StatusLabel tone="neutral">Unchanged</StatusLabel>}
                  {p.changed ? (
                    p.reviewedAtCurrentOutput ? (
                      <StatusLabel tone="ok">Reviewed</StatusLabel>
                    ) : (
                      <StatusLabel tone="warn">Needs review</StatusLabel>
                    )
                  ) : null}
                </span>
              </li>
            ))}
            <li className="flex flex-wrap items-center justify-between gap-2 py-2 last:pb-0">
              <span className="font-medium text-text">Project details</span>
              {w.change.detailsChanged ? <StatusLabel tone="warn">Changed</StatusLabel> : <StatusLabel tone="neutral">Unchanged</StatusLabel>}
            </li>
          </ul>
          {!w.change.hasChanges ? <p className="mt-3 text-sm text-muted">Nothing has changed yet.</p> : null}
        </Panel>
      ) : null}

      <DetailsPanel projectId={projectId} decision={d} readOnly={w.decisionStatus !== "in_progress"} />

      <Panel
        title="Rules that apply"
        description={`As resolved for this project from ${w.cityName}'s profile. Each cites its code section and effective date.`}
        actions={
          <Link href="/profile" className={actionClassName("secondary")}>
            City profile
          </Link>
        }
      >
        {!rules ? (
          <p className="text-sm text-muted">{analysis.text}. {analysis.detail}</p>
        ) : (
          <div className="flex flex-col gap-5">
            {rules.resourceTypes.map((rt) => {
              const buffers = rules.bufferRules.filter((b) => b.resourceType === rt.key);
              const triggers = rules.studyTriggers.filter((t) => t.resourceType === rt.key);
              return (
                <div key={rt.key}>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-text">{rt.label}</h3>
                    <StatusLabel tone={rt.mapStatus === "approximate" ? "warn" : "neutral"}>
                      {rt.mapStatus === "approximate" ? "Approximate boundary" : "Regulatory boundary"}
                    </StatusLabel>
                  </div>
                  {buffers.length === 0 && triggers.length === 0 ? (
                    <p className="mt-1 text-sm text-muted">No buffer or study-trigger rule in force.</p>
                  ) : (
                    <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-sm text-text">
                      {buffers.map((b) => (
                        <li key={b.key}>
                          {formatFeet(b.widthFt)} buffer — {formatRuleProvenance({ ...b.citation, effectiveOn: b.effectiveOn }).citations[0]}
                        </li>
                      ))}
                      {triggers.map((t) => (
                        <li key={t.key}>
                          {STUDY_LABEL[t.study]} within {formatFeet(t.withinFt)} — {formatRuleProvenance({ ...t.citation, effectiveOn: t.effectiveOn }).citations[0]}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
            {rules.treeRules.length > 0 ? (
              <div>
                <h3 className="text-sm font-semibold text-text">Significant trees</h3>
                <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-sm text-text">
                  {rules.treeRules.map((t) => (
                    <li key={t.key}>
                      {t.kind === "significant-tree"
                        ? `${t.group === "conifer" ? "Conifers" : "Deciduous trees"} of ${t.minDbhIn} inches DBH or larger`
                        : `Removals capped at ${t.maxCount} per ${t.periodYears} years`}{" "}
                      — {formatRuleProvenance({ ...t.citation, effectiveOn: t.effectiveOn }).citations[0]}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </Panel>

      <Panel title="Assumptions the analysis made" description="So none is buried in a run.">
        {!rules || !w.facts.resolvedFor ? (
          <p className="text-sm text-muted">{analysis.text}. {analysis.detail}</p>
        ) : (
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-text">
            {RULE_SETS.map((ruleSet) => {
              const date = w.facts.resolvedFor?.[ruleSet];
              if (date === undefined) throw new Error(`the analysis has no resolution date for ${ruleSet}`);
              // Read from the pinned inputs alone (never the profile as it is now), so it can't disagree with them.
              return (
                <li key={ruleSet}>
                  {RULE_SET_LABEL[ruleSet]} were resolved for {date}
                  {date === d.applicationFiledOn
                    ? ", the application's filing date (the rules in force when it was filed)."
                    : ", the date of the analysis (the rules in force that day)."}
                </li>
              );
            })}
            {rules.resourceTypes.filter((r) => r.mapStatus === "approximate").map((r) => (
              <li key={r.key}>{r.label} is treated as approximate: a site-specific study sets its regulated boundary.</li>
            ))}
            {w.facts.footprint === null ? <li>No footprint has been traced, so no impact was measured.</li> : null}
            <li>The rules come from {w.cityName}&apos;s profile as it stands now. Whether a rule set uses the filing date is a setting on the city profile.</li>
          </ul>
        )}
      </Panel>
    </div>
  );
}
