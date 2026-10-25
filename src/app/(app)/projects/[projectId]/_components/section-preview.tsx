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
import type { PhaseKey, SectionContent, Workflow } from "@/app/_lib/workflow-types";

// The report section a step produces, rendered from the same components the final document is stitched from
// (research-phases.md R1, R15; locked-report.md, "Sections"), over the project's current records. The narrative
// is the shown section version (or the analysis draft when none is stored); the tables, maps, and figures are
// rendered from the run. It is a preview: the released document is still built only from a finished snapshot.
// When the step has nothing to show yet it says exactly what is missing, never a stand-in section.
function NotYet({ children }: { children: ReactNode }) {
  return <p className="note">{children}</p>;
}

export async function SectionPreview({
  workflow: w,
  step,
  content,
}: {
  workflow: Workflow;
  step: "overview" | PhaseKey;
  content: SectionContent | null;
}) {
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

    if (!content) return <NotYet>This section appears once the {step} phase has a current output.</NotYet>;
    const needsRun = (render: (run: RunContent) => ReactNode): ReactNode =>
      live.run ? render(live.run) : <NotYet>This section appears once an analysis of the current inputs has finished.</NotYet>;

    switch (step) {
      case "site":
        return live.studyAreaSvg ? <SiteSection content={content} studyAreaSvg={live.studyAreaSvg} /> : <NotYet>Add a study area to see this section.</NotYet>;
      case "footprint":
        return live.studyAreaSvg ? (
          <FootprintSection content={content} studyAreaSvg={live.studyAreaSvg} footprintSvg={live.footprintSvg} />
        ) : (
          <NotYet>Add a study area to see this section.</NotYet>
        );
      case "evidence":
        return needsRun((run) => <EvidenceSection content={content} run={run} />);
      case "screening":
        return needsRun((run) => <ScreeningSection content={content} run={run} />);
      case "studies":
        return needsRun((run) => <StudiesSection content={content} run={run} />);
      case "impact":
        return needsRun((run) => <ImpactSection content={content} run={run} />);
    }
  };

  return (
    <div
      role="region"
      aria-label="Report section preview"
      tabIndex={0}
      className="report-paper max-h-[32rem] min-w-0 overflow-auto rounded-xl border border-line-strong bg-white p-5 shadow-panel"
    >
      <style>{REPORT_CONTENT_STYLES}</style>
      {body()}
    </div>
  );
}
