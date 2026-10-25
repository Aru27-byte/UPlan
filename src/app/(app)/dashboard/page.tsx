import Link from "next/link";

import { requireActor } from "@/app/_lib/actor";
import { getCity } from "@/app/_lib/city";
import { LIST_LIMIT, SAMPLE_STUDY_AREA } from "@/modules/decisions";
import { jurisdictionCovers } from "@/modules/profiles";
import { listProjectSummaries, type ProjectSummary } from "@/modules/workflow";
import { actionClassName } from "@/ui/action-styles";
import { AutoRefresh } from "@/ui/auto-refresh.client";
import { ActionForm } from "@/ui/action-form.client";
import { Icon } from "@/ui/icons";
import { PageHeader } from "@/ui/page-header";
import { Panel } from "@/ui/panel";
import { SubmitButton } from "@/ui/submit-button.client";

import { createSampleProjectAction } from "../projects/actions";

import { DashboardAssist } from "./DashboardAssist";
import { ProjectList } from "./project-list.client";

const phasesLeft = (s: ProjectSummary) => s.phasesTotal - s.phasesReady;

// TechDesign/project-dashboard.md, "The pages" — the page a person lands on after signing in (F20 R1). It
// shows the signed-in person's own research (R2) as one expandable table, most phases still to become ready
// first (R3), with the actions that fit each state (R4). Counts and words only: no percentage, score, or rating
// (R3, R7). Every read goes through a module function that checks ownership itself; nothing here decides access.
export default async function DashboardPage() {
  const [{ actor, name }, cityResult] = await Promise.all([requireActor(), getCity()]);
  if (cityResult.kind !== "city") return null; // the layout already shows the problem in place of this page
  const city = cityResult.city;

  const [summaries, hasSampleSite] = await Promise.all([
    listProjectSummaries(actor, city.id),
    jurisdictionCovers(city.id, SAMPLE_STUDY_AREA), // F23 R10: the sample site is in Sammamish
  ]);
  const inProgressCount = summaries.filter((s) => s.state !== "completed").length;
  const completedCount = summaries.length - inProgressCount;
  const sorted = [...summaries].sort((a, b) => phasesLeft(b) - phasesLeft(a) || b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
  const firstName = name.trim().split(/\s+/)[0] ?? name;

  const emptyState = (
    <Panel title="Start your first research">
      <p className="max-w-prose text-sm text-text">
        A project holds one application&apos;s research, from its site to a final document. Start one from
        scratch{hasSampleSite ? ", or start with sample data to see every phase work on a fictional site" : ""}.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link href="/projects/new" className={actionClassName("primary")}>
          <Icon name="plus" />
          New research
        </Link>
        {hasSampleSite ? (
          <ActionForm action={createSampleProjectAction}>
            <input type="hidden" name="jurisdictionId" value={city.id} />
            <SubmitButton variant="secondary" pendingLabel="Creating the sample project…">
              Start with sample data
            </SubmitButton>
          </ActionForm>
        ) : null}
      </div>
    </Panel>
  );

  const projectList = (
    <ProjectList
      projects={sorted}
      inProgressCount={inProgressCount}
      completedCount={completedCount}
      listLimit={LIST_LIMIT}
    />
  );

  return (
    <>
      <AutoRefresh active={summaries.some((s) => s.state === "finishing")} />
      <PageHeader
        title={`Welcome back, ${firstName}`}
        meta={<span className="text-lg font-semibold text-heading">Your {city.name} research</span>}
        actions={
          <>
            <DashboardAssist cityId={city.id} actorId={actor.userId} summaries={summaries} />
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
      {summaries.length === 0 ? emptyState : projectList}
    </>
  );
}