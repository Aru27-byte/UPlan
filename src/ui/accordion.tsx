import type { ReactNode } from "react";

import { Icon } from "./icons";
import { GROUP_TONE, type StepGroup } from "./phase/group-tones";

// A section of a step page's data that is closed until the planner opens it (research-phases.md R16). It is a
// native <details>, so it needs no script, opens from the keyboard, and keeps its state in the browser. The
// heading carries a one-line summary and any status, so the page reads without opening anything. The colored
// bar on the left is the step's group color. Maps and drawing editors are not accordions: they stay open.
export function Accordion({
  title,
  summary,
  status,
  group,
  headingLevel = 2,
  id,
  children,
}: {
  title: string;
  summary?: ReactNode;
  status?: ReactNode;
  group: StepGroup;
  headingLevel?: 2 | 3;
  id?: string;
  children: ReactNode;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <details
      id={id}
      className="group overflow-hidden rounded-xl border-2 border-cream/70 bg-surface text-text shadow-panel open:border-line"
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 hover:bg-canvas/60 [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className={`h-9 w-1.5 shrink-0 rounded-full ${GROUP_TONE[group].bar}`} />
        <span className="min-w-0 flex-1">
          <Heading className="text-base font-semibold text-text">{title}</Heading>
          {summary ? <span className="mt-0.5 block text-sm text-muted">{summary}</span> : null}
        </span>
        {status ? <span className="shrink-0">{status}</span> : null}
        <Icon name="chevron-down" className="transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t-2 border-line px-5 py-4">{children}</div>
    </details>
  );
}
