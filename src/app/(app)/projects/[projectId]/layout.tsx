import type { ReactNode } from "react";

import { loadProject } from "@/app/_lib/project";
import { applicationTypeLabel } from "@/app/_lib/labels";
import {
  STEP_GROUP,
  STEP_TITLE,
  analysisStatusText,
  projectHref,
  publishedVersion,
  stepLabel,
} from "@/app/_lib/workflow-labels";
import { AutoRefresh } from "@/ui/auto-refresh.client";
import { ConfirmDialog } from "@/ui/confirm-dialog.client";
import { PageHeader } from "@/ui/page-header";
import { StageRail, type RailStage } from "@/ui/phase/stage-rail.client";
import { StatusLabel } from "@/ui/status-label";

import { startResearchChangeAction } from "../actions";

// The frame of every project page (TechDesign/decision-overview.md, "Layout"): the project's name and state,
// a banner for anything that needs the planner's attention before they read on, and the stage rail. It reads
// the project once (loadProject is shared with the page below it) and renders nothing about a project the
// signed-in person doesn't own — that is a 404 from loadProject.
export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { workflow: w } = await loadProject(projectId);
  const d = w.decision;

  const analysis = analysisStatusText(w.facts.status);
  const analysisMatters = w.facts.status.kind !== "current" && !(w.facts.status.kind === "none" && w.facts.status.reason === "no-study-area");
  const isBusy =
    w.decisionStatus === "finishing" || w.facts.status.kind === "running" || w.facts.status.kind === "out-of-date";

  const stages: RailStage[] = w.steps.map((step) => {
    const label = stepLabel(step);
    return {
      key: step.step,
      label: STEP_TITLE[step.step],
      href: projectHref(projectId, step.step),
      group: STEP_GROUP[step.step],
      stateText: label.text,
      tone: label.tone,
    };
  });

  const meta = [
    `${w.cityName}`,
    applicationTypeLabel(d.applicationType),
    d.parcelOrAddress,
  ]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(" · ");

  return (
    <div className="flex flex-col gap-5">
      <AutoRefresh active={isBusy} />
      <PageHeader
        title={d.title}
        breadcrumb={[{ href: "/dashboard", label: "Dashboard" }]}
        meta={meta}
        status={
          <span className="flex flex-wrap items-center gap-2">
            {w.decisionStatus === "report_released" ? (
              <StatusLabel tone="info">Completed · version {publishedVersion(w.latestVersion)}</StatusLabel>
            ) : w.decisionStatus === "finishing" ? (
              <StatusLabel tone="info">Generating document</StatusLabel>
            ) : w.latestVersion !== null ? (
              <StatusLabel tone="info">Research change open</StatusLabel>
            ) : (
              <StatusLabel tone="neutral">In progress</StatusLabel>
            )}
            {w.usesSampleData ? <StatusLabel tone="warn">Sample data</StatusLabel> : null}
          </span>
        }
      />

      {w.usesSampleData ? (
        <p role="note" className="rounded-lg border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-text">
          <span className="font-semibold text-warn">This project uses sample data.</span> Its site, its footprint, or
          its evidence is illustrative, so nothing here describes a real place. The final document says so on its
          cover.
        </p>
      ) : null}

      {w.decisionStatus === "report_released" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-cream/70 bg-surface text-text shadow-panel px-4 py-3 text-sm">
          <p className="max-w-prose text-text">
            <span className="font-semibold">This research is completed.</span> Version {publishedVersion(w.latestVersion)} of its
            document is published and can&apos;t change. You can still update the research: change what needs
            changing, review what it affects, and publish the next version.
          </p>
          <ConfirmDialog
            triggerLabel="Start a research change"
            triggerVariant="primary"
            title={`Start a research change to version ${publishedVersion(w.latestVersion)}?`}
            confirmLabel="Start research change"
            pendingLabel="Starting…"
            action={startResearchChangeAction}
            fields={{ projectId, rowVersion: String(d.rowVersion), next: "overview" }}
          >
            Version {publishedVersion(w.latestVersion)} stays available and unchanged. Nothing new is published until you finish
            the change and review each phase it affects.
          </ConfirmDialog>
        </div>
      ) : null}

      {w.decisionStatus === "in_progress" && analysisMatters ? (
        <div
          role={w.facts.status.kind === "failed" ? "alert" : "status"}
          className="flex flex-col gap-1 rounded-lg border-2 border-cream/70 bg-surface text-text shadow-panel px-4 py-3 text-sm"
        >
          <div className="flex flex-wrap items-center gap-2">
            <StatusLabel tone={analysis.tone}>{analysis.text}</StatusLabel>
          </div>
          <p className="text-text">{analysis.detail}</p>
        </div>
      ) : null}

      <StageRail stages={stages} />
      {children}
    </div>
  );
}
