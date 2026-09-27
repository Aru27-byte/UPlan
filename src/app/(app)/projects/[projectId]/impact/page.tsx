import { phaseModel } from "@/app/_lib/phase-model";
import { loadProject } from "@/app/_lib/project";
import { MEASURE_LABEL, describeLimit, formatImpactQuantity } from "@/modules/analysis";
import { DataTable } from "@/ui/data-table";
import { Panel } from "@/ui/panel";
import { PhasePage } from "@/ui/phase/phase-page";
import { StatusLabel } from "@/ui/status-label";

import { recordReviewAction } from "../actions";

// Phase 6 (F9): what the proposal's footprint would remove or disturb, per regulated resource and buffer,
// measured in PostGIS against the pinned evidence. It states the impact and never whether it is acceptable
// (R6). Where a rule depends on an attribute the evidence lacks, the quantity is a range, never a guess.
export default async function ImpactPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { workflow: w } = await loadProject(projectId);
  const model = phaseModel(w, projectId, "impact");
  const { run, rules } = w.facts;
  const reviewAction = recordReviewAction.bind(null, projectId);

  // The impact needs a footprint as well as a current run: the phase says which is missing.
  if (!run || !rules || model.output === null) return <PhasePage model={model} reviewAction={reviewAction} />;

  const labelOf = (key: string): string => {
    const found = rules.resourceTypes.find((r) => r.key === key);
    if (!found) throw new Error(`the analysis names a resource type the profile lacks: ${key}`);
    return found.label;
  };

  const rows = run.results.impacts.map((impact) => ({
    key: impact.impactKey,
    cells: [
      labelOf(impact.resourceType),
      MEASURE_LABEL[impact.measure],
      <span key="q" className="font-semibold">
        {formatImpactQuantity(impact)}
      </span>,
      <div key="n" className="flex flex-col items-start gap-1.5">
        {impact.approximate ? <StatusLabel tone="warn">Approximate boundary</StatusLabel> : <StatusLabel tone="neutral">Regulatory boundary</StatusLabel>}
        {impact.dependsOn ? (
          <span className="text-muted">
            The range depends on <code>{impact.dependsOn}</code>, an attribute the evidence doesn&apos;t carry for this
            feature.
          </span>
        ) : null}
      </div>,
    ],
  }));

  return (
    <PhasePage model={model} reviewAction={reviewAction}>
      <Panel
        title="Measured impact"
        description="What the footprint would remove or disturb. UPlan shows this impact; it never says whether it is acceptable."
      >
        {rows.length === 0 ? (
          <p className="text-sm text-text">
            No mapped resource or buffer overlaps the footprint. This describes the mapped data, not a finding about the
            site.
          </p>
        ) : (
          <DataTable caption="Measured impact by resource" columns={["Resource", "Measure", "Quantity", "Boundary"]} rows={rows} />
        )}
      </Panel>
      <Panel headingLevel={3} title="What desk analysis can't see" description="These limits apply to every figure above.">
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-text">
          {run.results.limits.map((limit) => (
            <li key={`${limit.key}:${limit.resourceType ?? ""}:${limit.datasetVersionId ?? ""}`}>
              {describeLimit(limit, {
                resourceLabel: limit.resourceType ? labelOf(limit.resourceType) : null,
                datasetLimitation: limit.datasetVersionId ? (w.facts.datasetLimitations.get(limit.datasetVersionId) ?? null) : null,
              })}
            </li>
          ))}
        </ul>
      </Panel>
    </PhasePage>
  );
}
