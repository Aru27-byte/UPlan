import Link from "next/link";

import { requireActor } from "@/app/_lib/actor";
import { getCity } from "@/app/_lib/city";
import { projectHref, publishedVersion } from "@/app/_lib/workflow-labels";
import { LIST_LIMIT } from "@/modules/decisions";
import { formatTimestamp } from "@/modules/provenance";
import { listProjectSummaries, type ProjectSummary } from "@/modules/workflow";
import { actionClassName } from "@/ui/action-styles";
import { AutoRefresh } from "@/ui/auto-refresh.client";
import { ActionForm } from "@/ui/action-form.client";
import { ConfirmDialog } from "@/ui/confirm-dialog.client";
import { Icon } from "@/ui/icons";
import { PageHeader } from "@/ui/page-header";
import { Panel } from "@/ui/panel";
import { StatBox } from "@/ui/stat-box";
import { StatusLabel } from "@/ui/status-label";
import { SubmitButton } from "@/ui/submit-button.client";

import { createSampleProjectAction, deleteProjectAction, startResearchChangeAction } from "../projects/actions";
import { ExpandableRow } from "./expandable-row.client";
import { PhaseStatus } from "./phase-status";

const phasesLeft = (s: ProjectSummary) => s.phasesTotal - s.phasesReviewed;

// TechDesign/project-dashboard.md, "The pages" — the page a person lands on after signing in (F20 R1). It
// shows the signed-in person's own research (R2) as one expandable table, most phases still to review first
// (R3), with the actions that fit each state (R4). Counts and words only: no percentage, score, or rating (R3,
// R7). Every read goes through a module function that checks ownership itself; nothing here decides access.
export default async function DashboardPage() {
  const { actor, name } = await requireActor();
  const cityResult = await getCity();
  if (cityResult.kind !== "city") return null; // the layout already shows the problem in place of this page
  const city = cityResult.city;

  const summaries = await listProjectSummaries(actor);
  const inProgressCount = summaries.filter((s) => s.state !== "completed").length;
  const completedCount = summaries.length - inProgressCount;
  const sorted = [...summaries].sort((a, b) => phasesLeft(b) - phasesLeft(a) || b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
  const firstName = name.trim().split(/\s+/)[0] ?? name;

  return (
    <>
      <AutoRefresh active={summaries.some((s) => s.state === "finishing")} />
      <PageHeader
        title={`Welcome back, ${firstName}`}
        meta={<span className="text-lg font-semibold text-page-text">Your {city.name} research</span>}
        actions={
          <>
            <Link href="/profile" className={actionClassName("secondary")}>
              View city profile
              <Icon name="arrow-right" />
            </Link>
            <Link href="/projects/new" className={actionClassName("primary")}>
              <Icon name="plus" />
              New research
            </Link>
          </>
        }
      />

      {summaries.length === 0 ? (
        <Panel title="Start your first research">
          <p className="max-w-prose text-sm text-text">
            A project holds one application&apos;s research, from its site to a final document. Start one from
            scratch, or start with sample data to see every phase work on a fictional site.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/projects/new" className={actionClassName("primary")}>
              <Icon name="plus" />
              New research
            </Link>
            <ActionForm action={createSampleProjectAction}>
              <input type="hidden" name="jurisdictionId" value={city.id} />
              <SubmitButton variant="secondary" pendingLabel="Creating the sample project…">
                Start with sample data
              </SubmitButton>
            </ActionForm>
          </div>
        </Panel>
      ) : (
        <section aria-labelledby="research-heading" className="overflow-hidden rounded-xl border-2 border-cream/70 bg-surface text-text shadow-panel">
          <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b-2 border-line bg-canvas px-5 py-4">
            <div className="min-w-0">
              <h2 id="research-heading" className="text-xl font-bold text-text">
                My Research Projects
              </h2>
              <p className="mt-0.5 text-sm text-muted">Projects with the most phases left to review come first. Open one to see where each phase stands.</p>
            </div>
            <dl className="flex gap-2">
              <StatBox label="In progress" value={inProgressCount} />
              <StatBox label="Completed" value={completedCount} />
            </dl>
          </header>
          <div className="px-5 py-4">
            <ul className="flex flex-col gap-2.5">
              {sorted.map((p) => (
                <ProjectRow key={p.decision.id} project={p} timeZone={city.timeZone} />
              ))}
            </ul>
            {summaries.length >= LIST_LIMIT ? (
              <p className="mt-3 text-sm text-muted">Showing your {LIST_LIMIT} most recent projects. Older ones are kept but not listed here.</p>
            ) : null}
          </div>
        </section>
      )}
    </>
  );
}

function ProjectRow({ project: p, timeZone }: { project: ProjectSummary; timeZone: string }) {
  const d = p.decision;
  const title = d.title;
  const left = phasesLeft(p);

  return (
    <ExpandableRow
      summary={
        <>
          <span className="min-w-0 text-base font-semibold text-text">{title}</span>
          {p.state === "completed" ? (
            <StatusLabel tone="ok">Completed · version {publishedVersion(p.latestVersion)}</StatusLabel>
          ) : p.state === "finishing" ? (
            <StatusLabel tone="info">Generating document</StatusLabel>
          ) : (
            <StatusLabel tone={p.phasesReviewed === 0 ? "neutral" : "info"}>
              {p.phasesReviewed} of {p.phasesTotal} phases reviewed
            </StatusLabel>
          )}
          {/* The count of phases still waiting for review, readable before the row is opened. */}
          <span
            title={`${left} ${left === 1 ? "phase" : "phases"} left for review`}
            className={`inline-flex min-w-6 items-center justify-center rounded-full border-2 px-1.5 text-xs font-bold tabular-nums ${left === 0 ? "border-ok bg-ok-soft text-ok" : "border-ink bg-accent-gold text-ink"}`}
          >
            <span aria-hidden="true">{left}</span>
            <span className="sr-only">
              {left} {left === 1 ? "phase" : "phases"} left for review
            </span>
          </span>
          {p.usesSampleData ? <StatusLabel tone="warn">Sample data</StatusLabel> : null}
          <span className="text-xs text-muted">Updated {formatTimestamp(p.lastActivityAt, timeZone)}</span>
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
              review each phase it affects, and then publish the next version.
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
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t-2 border-line pt-3">
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
