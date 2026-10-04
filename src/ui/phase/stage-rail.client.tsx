"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";

import { Icon } from "../icons";
import { StatusLabel, type StatusTone } from "../status-label";

import { GROUP_TONE, type StepGroup } from "./group-tones";

// The stage rail on every project page (decision-overview.md F18 R1–R3, research-phases.md R17): one linear
// process, Set up → Assemble → Analyze → Report. Each group is its own color (shared with the report-section
// block and the accordions), the stages are numbered in order, and an arrow sits between stages and between
// groups so the direction of the work reads without the words. A stage's state is words and a shape, never
// color alone (F18 R12). It orders the work and never blocks it: every stage is a link (R3). Client-only for
// usePathname, so the current stage gets aria-current; it takes plain props and imports no runtime code from
// @/modules.
//
// Responsive by CONTAINER, not viewport: the app shell's sidebar takes a different share of the screen at
// every window size, so the width the rail actually has can't be read from a viewport breakpoint. The nav is a
// container, and below 56rem (@4xl) the whole process is one column read top to bottom; at 56rem and above the
// four groups sit side by side, left to right, each a column of its stages. One breakpoint, no overflow.
export type RailStage = {
  key: string;
  label: string;
  href: string;
  group: StepGroup;
  stateText: string;
  tone: StatusTone;
};

type Group = { name: StepGroup; stages: { stage: RailStage; number: number }[] };

function groupStages(stages: RailStage[]): Group[] {
  const groups: Group[] = [];
  stages.forEach((stage, index) => {
    const last = groups.at(-1);
    const entry = { stage, number: index + 1 };
    if (last?.name === stage.group) last.stages.push(entry);
    else groups.push({ name: stage.group, stages: [entry] });
  });
  return groups;
}

export function StageRail({ stages }: { stages: RailStage[] }) {
  const pathname = usePathname();
  const groups = groupStages(stages);
  return (
    <nav
      aria-label="Research stages"
      className="@container flex flex-col gap-3 rounded-xl border-2 border-cream/70 bg-surface p-3 text-text shadow-panel"
    >
      <div aria-hidden="true" className="eyebrow flex items-center gap-2 px-1 text-muted">
        <span>Start</span>
        <span className="h-0.5 flex-1 rounded-full bg-ink/30" />
        <Icon name="arrow-right" />
        <span>Finish</span>
      </div>
      <ol className="flex flex-col gap-1 @4xl:flex-row @4xl:items-stretch">
        {groups.map((group, groupIndex) => {
          const tone = GROUP_TONE[group.name];
          return (
            <Fragment key={group.name}>
              {groupIndex > 0 ? (
                <li aria-hidden="true" className="flex items-center justify-center py-0.5 text-ink @4xl:px-0.5 @4xl:py-0">
                  <Icon name="arrow-right" className="size-6 rotate-90 @4xl:rotate-0" />
                </li>
              ) : null}
              <li className={`flex min-w-0 flex-col gap-2 rounded-lg border-2 p-2 text-ink @4xl:flex-1 ${tone.edge} ${tone.fill}`}>
                <p className="eyebrow px-1 text-ink">
                  {groupIndex + 1}. {group.name}
                </p>
                <ol className="flex flex-1 flex-col gap-1">
                  {group.stages.map(({ stage, number }, stageIndex) => {
                    const active = pathname === stage.href || pathname.startsWith(`${stage.href}/`);
                    return (
                      <Fragment key={stage.key}>
                        {stageIndex > 0 ? (
                          <li aria-hidden="true" className="flex items-center justify-center text-ink">
                            <Icon name="arrow-right" className="rotate-90" />
                          </li>
                        ) : null}
                        <li className="flex min-w-0">
                          <Link
                            href={stage.href}
                            aria-current={active ? "page" : undefined}
                            className={`flex w-full min-w-0 flex-col gap-1.5 rounded-lg border-2 bg-white px-3 py-2.5 ${
                              active ? "border-ink shadow-button" : "border-transparent hover:border-ink/40"
                            }`}
                          >
                            <span
                              className={`flex items-center gap-2 text-sm font-semibold text-text ${active ? "underline decoration-2 underline-offset-4" : ""}`}
                            >
                              <span
                                aria-hidden="true"
                                className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs text-page-text"
                              >
                                {number}
                              </span>
                              <span className="min-w-0 break-words">{stage.label}</span>
                            </span>
                            <span className="self-start">
                              <StatusLabel tone={stage.tone}>{stage.stateText}</StatusLabel>
                            </span>
                          </Link>
                        </li>
                      </Fragment>
                    );
                  })}
                </ol>
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
