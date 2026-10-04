import { phaseModel } from "@/app/_lib/phase-model";
import { loadProject } from "@/app/_lib/project";
import { SCREENING_CANNOT_SEE, STUDY_LABEL, STUDY_NOT_FLAGGED, describeScreeningGap } from "@/modules/analysis";
import { formatFeet } from "@/modules/provenance";
import { DataTable } from "@/ui/data-table";
import { Accordion } from "@/ui/accordion";
import { PhasePage } from "@/ui/phase/phase-page";
import { StatusLabel } from "@/ui/status-label";

import { recordReviewAction } from "../actions";
import { StepIntro } from "../_components/step-intro";

// Phase 4 (F14): each study the city's profile names, and whether mapped data flags it. A flag can add a
// study; the absence of a flag never removes one, because the city decides which studies an application needs
// (charter, Pilot context). So the page never says a study is not needed — only that mapped data doesn't flag it.
export default async function StudiesPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { workflow: w } = await loadProject(projectId);
  const model = phaseModel(w, projectId, "studies");
  const { run, rules } = w.facts;
  const reviewAction = recordReviewAction.bind(null, projectId);
  const intro = <StepIntro projectId={projectId} step="studies" />;

  if (!run || !rules) return <PhasePage model={model} reviewAction={reviewAction} intro={intro} />;

  const labelOf = (key: string): string => {
    const found = rules.resourceTypes.find((r) => r.key === key);
    if (!found) throw new Error(`the analysis names a resource type the profile lacks: ${key}`);
    return found.label;
  };
  const named = [...new Set(rules.studyTriggers.map((t) => t.study))].sort();

  const gappedTypes = new Set(run.results.evidenceBase.gaps.map((g) => g.resourceType));
  const rows = named.map((study) => {
    const flags = run.results.studyFlags.filter((f) => f.study === study);
    // P2: a study whose triggering resource has no usable dataset is not "not flagged": the data can't say.
    const noDataFor = [...new Set(rules.studyTriggers.filter((t) => t.study === study && gappedTypes.has(t.resourceType)).map((t) => labelOf(t.resourceType)))];
    return {
      key: study,
      cells: [
        STUDY_LABEL[study],
        flags.length === 0 ? (
          noDataFor.length > 0 ? (
            <StatusLabel key="s" tone="warn">
              Not flagged: no data
            </StatusLabel>
          ) : (
            <StatusLabel key="s" tone="neutral">
              Not flagged
            </StatusLabel>
          )
        ) : (
          <StatusLabel key="s" tone="warn">
            Flagged by mapped data
          </StatusLabel>
        ),
        flags.length === 0 ? (
          <span key="d">
            {`${STUDY_LABEL[study]} ${STUDY_NOT_FLAGGED}`}
            {noDataFor.length > 0 ? ` No dataset covers ${noDataFor.join(", ")}, so mapped data can't flag it there.` : ""}
          </span>
        ) : (
          <ul key="d" className="flex flex-col gap-1">
            {flags.map((f) => (
              <li key={f.triggerKey}>
                {labelOf(f.resourceType)}:{" "}
                {f.nearestDistanceFt === 0
                  ? "a mapped feature is inside the study area"
                  : `the nearest mapped feature is ${formatFeet(f.nearestDistanceFt)} away`}
                {f.approximate ? " (approximate boundary)" : ""}.
              </li>
            ))}
          </ul>
        ),
      ],
    };
  });

  const gaps = run.results.evidenceBase.gaps;

  return (
    <PhasePage model={model} reviewAction={reviewAction} intro={intro}>
      <Accordion
        group={model.group}
        title="Studies named in the city's profile"
        summary="The city decides which studies an application needs. This shows which ones mapped data flags."
      >
        <p className="mb-4 rounded-lg border border-info/25 bg-info-soft px-4 py-3 text-sm text-text">{SCREENING_CANNOT_SEE}</p>
        <DataTable caption="Studies named in the profile and whether mapped data flags them" columns={["Study", "Status", "Basis"]} rows={rows} />
      </Accordion>
      {gaps.length > 0 ? (
        <Accordion
          group={model.group}
          headingLevel={3}
          title="Where the data can't say"
          summary="A study can't be flagged by data that isn't there."
        >
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-text">
            {gaps.map((gap) => (
              <li key={`${gap.resourceType}:${gap.reason}`}>
                {labelOf(gap.resourceType)}: {describeScreeningGap(gap.reason)}
              </li>
            ))}
          </ul>
        </Accordion>
      ) : null}
    </PhasePage>
  );
}
