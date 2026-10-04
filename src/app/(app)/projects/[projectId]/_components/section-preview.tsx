import type { ReactNode } from "react";

import {
  DetailsSection,
  EvidenceSection,
  FootprintSection,
  ImpactSection,
  REPORT_CONTENT_STYLES,
  RulesSection,
  ScreeningSection,
  SiteSection,
  StudiesSection,
  ReportDetailsSchema,
  loadLiveReportContent,
  type RunContent,
} from "@/modules/reports";
import type { FeedbackStep, Workflow } from "@/modules/workflow";

// The report section a step produces, rendered from the same components the final document is stitched from
// (research-phases.md R15; locked-report.md, "Sections"), over the project's current records. It is a preview:
// the released document is still built only from a finished, reviewed snapshot. When the step has nothing to
// show yet it says exactly what is missing, never a stand-in section.
function NotYet({ children }: { children: ReactNode }) {
  return <p className="note">{children}</p>;
}

export async function SectionPreview({ workflow: w, step }: { workflow: Workflow; step: FeedbackStep }) {
  const d = w.decision;
  const live = await loadLiveReportContent({
    decisionId: d.id,
    jurisdictionId: d.jurisdictionId,
    runId: w.facts.run?.id ?? null,
    studyAreaRevision: w.facts.studyArea?.revision ?? null,
    footprintRevision: w.facts.footprint?.revision ?? null,
  });

  const body = (): ReactNode => {
    if (step === "overview") {
      const details = ReportDetailsSchema.parse({
        title: d.title,
        applicationType: d.applicationType,
        permitNumber: d.permitNumber,
        parcelOrAddress: d.parcelOrAddress,
        applicant: d.applicant,
        projectManager: d.projectManager,
        targetDecisionOn: d.targetDecisionOn,
        applicationFiledOn: d.applicationFiledOn,
        usesSampleData: w.usesSampleData,
      });
      return (
        <>
          <h2>{d.title}</h2>
          <DetailsSection details={details} profileVersionNumber={live.run?.profileVersionNumber ?? null} />
          {live.run ? <RulesSection run={live.run} /> : <NotYet>The rules section appears once an analysis of the current inputs has finished.</NotYet>}
        </>
      );
    }

    const view = w.phases.find((p) => p.phase === step);
    if (!view) throw new Error(`the workflow has no ${step} phase`);
    if (!view.output) return <NotYet>This section appears once the {view.phase} output exists. See the drafted output below for what is missing.</NotYet>;
    const summary = { headline: view.output.headline, lines: view.output.lines };
    const needsRun = (render: (run: RunContent) => ReactNode): ReactNode =>
      live.run ? render(live.run) : <NotYet>This section appears once an analysis of the current inputs has finished.</NotYet>;

    switch (step) {
      case "site":
        return live.studyAreaSvg ? <SiteSection summary={summary} studyAreaSvg={live.studyAreaSvg} /> : <NotYet>Add a study area to see this section.</NotYet>;
      case "footprint":
        return live.studyAreaSvg ? (
          <FootprintSection summary={summary} studyAreaSvg={live.studyAreaSvg} footprintSvg={live.footprintSvg} />
        ) : (
          <NotYet>Add a study area to see this section.</NotYet>
        );
      case "evidence":
        return needsRun((run) => <EvidenceSection summary={summary} run={run} />);
      case "screening":
        return needsRun((run) => <ScreeningSection summary={summary} run={run} />);
      case "studies":
        return needsRun((run) => <StudiesSection summary={summary} run={run} />);
      case "impact":
        return needsRun((run) => <ImpactSection summary={summary} run={run} />);
    }
  };

  return (
    <div
      role="region"
      aria-label="Report section preview"
      tabIndex={0}
      className="report-paper max-h-[32rem] min-w-0 overflow-auto rounded-lg border-2 border-ink bg-white p-5 shadow-button"
    >
      <style>{REPORT_CONTENT_STYLES}</style>
      {body()}
    </div>
  );
}
