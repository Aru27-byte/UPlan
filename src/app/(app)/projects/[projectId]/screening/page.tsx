import { phaseModel } from "@/app/_lib/phase-model";
import { loadProject } from "@/app/_lib/project";
import { SCREENING_CANNOT_SEE, describeScreeningGap, describeScreeningRow } from "@/modules/analysis";
import { DataTable } from "@/ui/data-table";
import { Accordion } from "@/ui/accordion";
import { PhasePage } from "@/ui/phase/phase-page";
import { StatusLabel } from "@/ui/status-label";

import { recordReviewAction } from "../actions";
import { StepIntro } from "../_components/step-intro";

// Phase 3 (F14): what the mapped data says is in, and near, the study area, per resource type. It is a
// register of measurements, not a finding: an empty row is a measured zero within a stated search distance,
// and a resource type with no usable dataset is a gap that says nothing can be said (P2).
export default async function ScreeningPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { workflow: w } = await loadProject(projectId);
  const model = phaseModel(w, projectId, "screening");
  const { run, rules } = w.facts;
  const reviewAction = recordReviewAction.bind(null, projectId);
  const intro = <StepIntro projectId={projectId} step="screening" />;

  if (!run || !rules) return <PhasePage model={model} reviewAction={reviewAction} intro={intro} />;

  const labelOf = (key: string): string => {
    const found = rules.resourceTypes.find((r) => r.key === key);
    if (!found) throw new Error(`the analysis names a resource type the profile lacks: ${key}`);
    return found.label;
  };
  const titleOf = (versionId: string): string => {
    const title = w.facts.datasetTitles.get(versionId);
    if (title === undefined) throw new Error(`dataset version ${versionId} is not one the analysis pinned`);
    return title;
  };

  const rows = [
    ...run.results.screening.map((row) => ({
      key: `${row.resourceType}:${row.datasetVersionId}`,
      cells: [
        labelOf(row.resourceType),
        titleOf(row.datasetVersionId),
        <div key="finding" className="flex flex-col items-start gap-1.5">
          <span>{describeScreeningRow(row)}</span>
          {row.approximate ? <StatusLabel tone="warn">Approximate boundary</StatusLabel> : null}
        </div>,
      ],
    })),
    ...run.results.evidenceBase.gaps.map((gap) => ({
      key: `gap:${gap.resourceType}:${gap.reason}`,
      cells: [
        labelOf(gap.resourceType),
        "No usable dataset",
        <span key="gap" className="text-muted">
          {describeScreeningGap(gap.reason)}
        </span>,
      ],
    })),
  ];

  return (
    <PhasePage model={model} reviewAction={reviewAction} intro={intro}>
      <Accordion
        group={model.group}
        title="Screening register"
        summary={`${rows.length} ${rows.length === 1 ? "row" : "rows"}. Screening flags reasons to look closer. It is not a finding, and it never clears land.`}
      >
        <p className="mb-4 rounded-lg border border-info/25 bg-info-soft px-4 py-3 text-sm text-text">{SCREENING_CANNOT_SEE}</p>
        <DataTable caption="Screening register by resource type and dataset" columns={["Resource type", "Dataset", "What is mapped"]} rows={rows} />
      </Accordion>
    </PhasePage>
  );
}
