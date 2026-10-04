import Link from "next/link";

import { requireActor } from "@/app/_lib/actor";
import { getCity } from "@/app/_lib/city";
import { applicationTypeLabel } from "@/app/_lib/labels";
import { NEXT_ACTION_TEXT, projectHref, publishedVersion } from "@/app/_lib/workflow-labels";
import { LIST_LIMIT } from "@/modules/decisions";
import { getProfileOverview } from "@/modules/profiles";
import { formatTimestamp } from "@/modules/provenance";
import { listProjectSummaries, type ProjectSummary } from "@/modules/workflow";
import { actionClassName } from "@/ui/action-styles";
import { AutoRefresh } from "@/ui/auto-refresh.client";
import { ActionForm } from "@/ui/action-form.client";
import { ConfirmDialog } from "@/ui/confirm-dialog.client";
import { Icon } from "@/ui/icons";
import { Metric } from "@/ui/metric";
import { PageHeader } from "@/ui/page-header";
import { Panel } from "@/ui/panel";
import { StatusLabel } from "@/ui/status-label";
import { SubmitButton } from "@/ui/submit-button.client";

import { createSampleProjectAction, deleteProjectAction, startResearchChangeAction } from "../projects/actions";

// TechDesign/project-dashboard.md, "The pages" — the page a person lands on after signing in (F20 R1). It
// shows the signed-in person's own research (R2), what each project needs next (R3), the actions that fit
// each state (R4), and the city's profile (R6). Counts and words only: no percentage, score, or rating (R3,
// R7). Every read goes through a module function that checks ownership itself; nothing here decides access.
export default async function DashboardPage() {
  const [{ actor, name }, cityResult] = await Promise.all([requireActor(), getCity()]);
  if (cityResult.kind !== "city") return null; // the layout already shows the problem in place of this page
  const city = cityResult.city;

  const [summaries, profile] = await Promise.all([listProjectSummaries(actor), getProfileOverview(city.id)]);
  const current = summaries.filter((s) => s.state !== "completed");
  const completed = summaries.filter((s) => s.state === "completed");
  const awaitingReview = summaries.filter((s) => s.hasPhaseAwaitingReview).length;
  const firstName = name.trim().split(/\s+/)[0] ?? name;

  return (
    <>
      <AutoRefresh active={summaries.some((s) => s.state === "finishing")} />
      <PageHeader
        title="Dashboard"
        meta={`Welcome back, ${firstName}. Your research for ${city.name}, ${city.stateCode}.`}
        actions={
          <Link href="/projects/new" className={actionClassName("primary")}>
            <Icon name="plus" />
            New research
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="In progress" value={current.length} />
        <Metric label="Completed" value={completed.length} />
        <Metric label="With a phase awaiting review" value={awaitingReview} />
      </div>

      <Panel
        title="City profile"
        description={`The rules and settings every project in ${city.name} is analyzed under.`}
        actions={
          <Link href="/profile" className={actionClassName("secondary")}>
            View city profile
            <Icon name="arrow-right" />
          </Link>
        }
      >
        {profile.versionNumber === null ? (
          <p className="text-sm text-text">
            No profile has been approved for {city.name} yet, so no project can be analyzed. Upload the city&apos;s
            rules on the City profile page; UPlan staff approve them.
          </p>
        ) : (
          <dl className="grid gap-4 text-sm sm:grid-cols-4">
            <ProfileFact label="Current version" value={`Version ${profile.versionNumber}`} />
            <ProfileFact
              label="Last changed"
              value={profile.changedAt ? formatTimestamp(profile.changedAt, city.timeZone) : "—"}
            />
            <ProfileFact label="Resource types" value={String(profile.resourceTypeCount)} />
            <ProfileFact label="Rules" value={String(profile.ruleCount)} />
          </dl>
        )}
      </Panel>

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
        <>
          <ProjectSection title="Current research" empty="Nothing in progress." projects={current} timeZone={city.timeZone} />
          <ProjectSection title="Completed research" empty="Nothing completed yet." projects={completed} timeZone={city.timeZone} />
          {summaries.length >= LIST_LIMIT ? (
            <p className="text-sm text-page-muted">
              Showing your {LIST_LIMIT} most recent projects. Older ones are kept but not listed here.
            </p>
          ) : null}
        </>
      )}
    </>
  );
}

function ProfileFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-0.5 font-semibold text-text">{value}</dd>
    </div>
  );
}

function ProjectSection({
  title,
  empty,
  projects,
  timeZone,
}: {
  title: string;
  empty: string;
  projects: ProjectSummary[];
  timeZone: string;
}) {
  return (
    <Panel title={title} bodyClassName="p-0">
      {projects.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-line">
          {projects.map((p) => (
            <ProjectRow key={p.decision.id} project={p} timeZone={timeZone} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function ProjectRow({ project: p, timeZone }: { project: ProjectSummary; timeZone: string }) {
  const d = p.decision;
  const title = d.title;
  const meta = [
    applicationTypeLabel(d.applicationType),
    d.parcelOrAddress,
    d.applicationFiledOn ? `Filed ${d.applicationFiledOn}` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");

  const stage =
    p.state === "completed"
      ? `Document version ${publishedVersion(p.latestVersion)} is published.`
      : p.state === "finishing"
        ? "The document is being generated."
        : `${p.phasesReviewed} of ${p.phasesTotal} phases reviewed. ${p.nextAction ? `Next: ${NEXT_ACTION_TEXT[p.nextAction.key]}` : ""}`.trim();

  return (
    <li className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold">
            <Link href={projectHref(d.id, "overview")} className="rounded text-text underline-offset-2 hover:text-brand hover:underline">
              {title}
            </Link>
          </h3>
          {p.state === "completed" ? (
            <StatusLabel tone="info">Completed · version {publishedVersion(p.latestVersion)}</StatusLabel>
          ) : p.state === "finishing" ? (
            <StatusLabel tone="info">Generating document</StatusLabel>
          ) : (
            <StatusLabel tone="neutral">In progress</StatusLabel>
          )}
          {p.usesSampleData ? <StatusLabel tone="warn">Sample data</StatusLabel> : null}
          {p.state === "in-progress" && p.latestVersion !== null ? (
            <StatusLabel tone="info">Research change open</StatusLabel>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-muted">{meta}</p>
        <p className="mt-1 text-sm text-text">{stage}</p>
        <p className="mt-1 text-xs text-muted">Last worked on {formatTimestamp(p.lastActivityAt, timeZone)}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {p.state === "in-progress" ? (
          <Link
            href={projectHref(d.id, p.nextAction?.step ?? "overview")}
            aria-label={`Resume research: ${title}`}
            className={actionClassName("primary")}
          >
            Resume research
            <Icon name="arrow-right" />
          </Link>
        ) : null}
        {p.state === "completed" ? (
          <>
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
            <a
              href={`/api/projects/${d.id}/documents/${publishedVersion(p.latestVersion)}`}
 download
              aria-label={`Download document: ${title}`}
              className={actionClassName("secondary")}
            >
              <Icon name="download" />
              Download document
            </a>
          </>
        ) : null}
        {p.state !== "finishing" ? (
          <ConfirmDialog
            triggerLabel="Delete research"
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
      </div>
    </li>
  );
}
