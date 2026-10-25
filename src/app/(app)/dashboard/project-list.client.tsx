"use client";

import { useState } from "react";
import Link from "next/link";

import { Icon } from "@/ui/icons";
import { panelClassName } from "@/ui/panel";
import { StatBox } from "@/ui/stat-box";
import { ExpandableRow } from "./expandable-row.client";
import { PhaseStatus } from "./phase-status";
import type { ProjectSummary } from "@/app/_lib/workflow-types";
import { projectHref, publishedVersion } from "@/app/_lib/workflow-client";
import { actionClassName } from "@/ui/action-styles";
import { ConfirmDialog } from "@/ui/confirm-dialog.client";
import { StatusLabel } from "@/ui/status-label";
import { startResearchChangeAction, deleteProjectAction } from "../projects/actions";

const phasesLeft = (s: ProjectSummary) => s.phasesTotal - s.phasesReady;

function formatTimestampClient(date: Date | string): string {
  return new Date(date).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

type ProjectListProps = {
  projects: ProjectSummary[];
  inProgressCount: number;
  completedCount: number;
  listLimit: number;
}

export function ProjectList({ projects, inProgressCount, completedCount, listLimit }: ProjectListProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = projects.filter((p) =>
    p.decision.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <div className="flex flex-col gap-4">
        <section aria-labelledby="research-heading" className={`overflow-hidden ${panelClassName}`}>
          <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <h2 id="research-heading" className="font-display text-2xl font-extrabold tracking-[-0.02em] text-heading">
                My Research Projects
              </h2>
              <p className="mt-0.5 text-sm text-muted">
                Projects with the most phases left to become ready come first. Open one to see where each phase stands.
              </p>
            </div>
            <dl className="flex gap-2">
              <StatBox label="In progress" value={inProgressCount} />
              <StatBox label="Completed" value={completedCount} />
            </dl>
          </header>
          <div className="px-5 py-4">
            <div className="relative mb-4">
              <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="search"
                placeholder="Search projects…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-base border border-line rounded-xl bg-canvas focus:outline-none focus:ring-2 focus:ring-accent-green focus:border-transparent"
                aria-label="Search projects by title"
              />
            </div>
            <ul className="flex flex-col gap-2.5">
              {filtered.map((p) => (
                <ProjectRow key={p.decision.id} project={p} />
              ))}
              {filtered.length === 0 && projects.length > 0 ? (
                <li className="text-center py-8 text-muted">
                  No projects match “{searchQuery}”.
                </li>
              ) : filtered.length === 0 ? (
                <li className="text-center py-8 text-muted">
                  No projects yet.
                </li>
              ) : null}
            </ul>
            {projects.length >= listLimit ? (
              <p className="mt-3 text-sm text-muted">
                Showing your {listLimit} most recent projects. Older ones are kept but not listed here.
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </>
  );
}

function ProjectRow({ project: p }: { project: ProjectSummary }) {
  const d = p.decision;
  const title = d.title;
  const left = phasesLeft(p);

  return (
    <ExpandableRow
      summary={
        <>
          <span className="min-w-0 text-base font-semibold text-text transition-colors duration-150 group-hover:text-accent-lime">{title}</span>
          {p.state === "completed" ? (
            <StatusLabel tone="ok">Completed · version {publishedVersion(p.latestVersion)}</StatusLabel>
          ) : p.state === "finishing" ? (
            <StatusLabel tone="info">Generating document</StatusLabel>
          ) : (
            <StatusLabel tone={p.phasesReady === 0 ? "neutral" : "info"}>
              {p.phasesReady} of {p.phasesTotal} phases ready
            </StatusLabel>
          )}
          <span
            title={`${left} ${left === 1 ? "phase" : "phases"} left to become ready`}
            className={`inline-flex min-w-6 items-center justify-center rounded-full border px-1.5 font-mono text-xs font-bold tabular-nums ${left === 0 ? "border-ok/45 bg-ok-soft text-ok" : "border-transparent bg-accent-gold text-ink"}`}
          >
            <span aria-hidden="true">{left}</span>
            <span className="sr-only">
              {left} {left === 1 ? "phase" : "phases"} left to become ready
            </span>
          </span>
          {p.usesSampleData ? <StatusLabel tone="warn">Sample data</StatusLabel> : null}
          <span className="text-xs text-muted">Updated {formatTimestampClient(p.lastActivityAt)}</span>
        </>
      }
      actions={
        <>
          {p.state === "in-progress" ? (
            <Link
              href={projectHref(d.id, p.nextAction?.step ?? "overview")}
              aria-label={`Resume research: ${title}`}
              className={actionClassName("primary")}
            >
              Resume
              <Icon name="arrow-right" />
            </Link>
          ) : null}
          {p.state === "completed" ? (
            <ConfirmDialog
              triggerLabel="Re-research"
              triggerAriaLabel={`Re-research: ${title}`}
              triggerVariant="primary"
              title={`Start a research change to version ${publishedVersion(p.latestVersion)}?`}
              confirmLabel="Start research change"
              pendingLabel="Starting…"
              action={startResearchChangeAction}
              fields={{ projectId: d.id, rowVersion: String(d.rowVersion), next: "overview" }}
            >
              Version {publishedVersion(p.latestVersion)} stays available and unchanged. You will change what needs changing,
              update each section it affects, and then publish the next version.
            </ConfirmDialog>
          ) : null}
          {p.state !== "finishing" ? (
            <ConfirmDialog
              triggerLabel="Delete"
              triggerAriaLabel={`Delete research: ${title}`}
              triggerVariant="danger"
              title={`Delete “${title}” from view?`}
              confirmLabel="Delete research"
              confirmVariant="danger"
              pendingLabel="Deleting…"
              action={deleteProjectAction}
              fields={{ projectId: d.id, rowVersion: String(d.rowVersion) }}
            >
              The project disappears from your lists. UPlan keeps every record it holds, because working data may be
              public record, so this can&apos;t remove them.
            </ConfirmDialog>
          ) : null}
        </>
      }
    >
      <PhaseStatus project={p} />
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <Link href={projectHref(d.id, "overview")} aria-label={`Open overview: ${title}`} className={actionClassName("ghost")}>
          Open overview
          <Icon name="arrow-right" />
        </Link>
        {p.state === "completed" ? (
          <a
            href={`/api/projects/${d.id}/documents/${publishedVersion(p.latestVersion)}`}
            download
            aria-label={`Download document: ${title}`}
            className={actionClassName("ghost")}
          >
            <Icon name="download" />
            Download document
          </a>
        ) : null}
      </div>
    </ExpandableRow>
  );
}