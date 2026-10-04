import Link from "next/link";

import { PHASE_TITLE, projectHref, reviewStateLabel } from "@/app/_lib/workflow-labels";
import type { ProjectSummary } from "@/modules/workflow";
import { Icon, type IconName } from "@/ui/icons";
import type { StatusTone } from "@/ui/status-label";

// Each tone gets its own icon as well as its own colors, so a phase's state is never color alone (WCAG 1.4.1).
const NODE: Record<StatusTone, { icon: IconName; circle: string }> = {
  ok: { icon: "check", circle: "border-ok bg-ok-soft text-ok" },
  warn: { icon: "alert", circle: "border-warn bg-warn-soft text-warn" },
  info: { icon: "clock", circle: "border-info bg-info-soft text-info" },
  danger: { icon: "x", circle: "border-danger bg-danger-soft text-danger" },
  neutral: { icon: "circle", circle: "border-line bg-white text-muted" },
};

// The six research phases in order as a track of numbered nodes, each linking to its page, with the count of
// phases not yet reviewed at the top right. Counts and words only (project-dashboard.md R3).
export function PhaseStatus({ project }: { project: ProjectSummary }) {
  const phasesLeft = project.phasesTotal - project.phasesReviewed;
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <p className="eyebrow text-muted">Phase status</p>
        <dl>
          <div className="rounded-lg border-2 border-ink bg-white px-4 py-1.5 text-center shadow-button">
            <dt className="eyebrow text-muted">Phases left for review</dt>
            <dd className="text-2xl leading-tight font-bold text-text tabular-nums">{phasesLeft}</dd>
          </div>
        </dl>
      </div>
      <ol className="grid grid-cols-2 gap-x-2 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
        {project.phases.map((p, index) => {
          const state = reviewStateLabel(p.state);
          const node = NODE[state.tone];
          const isLast = index === project.phases.length - 1;
          return (
            <li key={p.phase} className="relative">
              {isLast ? null : (
                <span
                  aria-hidden="true"
                  className={`absolute top-5 left-1/2 hidden h-1 w-full -translate-y-1/2 lg:block ${state.kind === "reviewed" ? "bg-ok" : "bg-line"}`}
                />
              )}
              <Link
                href={projectHref(project.decision.id, p.phase)}
                aria-label={`${PHASE_TITLE[p.phase]}: ${state.text}`}
                className="relative flex flex-col items-center gap-1.5 rounded-lg px-1 text-center"
              >
                <span className={`flex size-10 items-center justify-center rounded-full border-2 ${node.circle}`}>
                  <Icon name={node.icon} />
                </span>
                <span className="text-sm font-semibold text-text">
                  {index + 1}. {PHASE_TITLE[p.phase]}
                </span>
                <span className="text-xs font-medium text-muted">{state.text}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
