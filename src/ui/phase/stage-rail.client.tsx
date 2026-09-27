"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { StatusLabel, type StatusTone } from "../status-label";

// The stage rail on every project page (decision-overview.md F18 R1–R3): the order of the work, grouped as
// Set up, Assemble, Analyze, Report, with each stage's state as words and a shape (R12). It orders the work
// and never blocks it: every stage is a link (R3). Client-only for usePathname, so the current stage gets
// aria-current; it takes plain props and imports no runtime code from @/modules.
export type RailStage = {
  key: string;
  label: string;
  href: string;
  group: string;
  stateText: string;
  tone: StatusTone;
};

export function StageRail({ stages }: { stages: RailStage[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Research stages" className="overflow-hidden rounded-xl border-2 border-cream/70 bg-surface text-text shadow-panel">
      <ol className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4 2xl:grid-cols-8">
        {stages.map((stage, index) => {
          const active = pathname === stage.href || pathname.startsWith(`${stage.href}/`);
          const startsGroup = index === 0 || stages[index - 1]?.group !== stage.group;
          return (
            <li key={stage.key} className="flex bg-surface">
              <Link
                href={stage.href}
                aria-current={active ? "page" : undefined}
                className={`flex w-full flex-col gap-1 px-3 py-3 ${active ? "bg-card-yellow" : "hover:bg-canvas"}`}
              >
                <span className="eyebrow text-[0.6875rem] text-muted">
                  {startsGroup ? stage.group : " "}
                </span>
                <span className={`text-sm font-semibold ${active ? "text-ink underline decoration-2 underline-offset-4" : "text-text"}`}>
                  {index + 1}. {stage.label}
                </span>
                <StatusLabel tone={stage.tone}>{stage.stateText}</StatusLabel>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
