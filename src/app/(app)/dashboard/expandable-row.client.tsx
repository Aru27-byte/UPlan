"use client";

import { useId, useState, type ReactNode } from "react";

import { Icon } from "@/ui/icons";

// One row of the research table: the summary is the toggle for the details beneath it, and the actions sit
// beside the toggle rather than inside it, because a button can't hold other buttons. The summary, actions, and
// details are rendered on the server and passed in, so this file holds only the open state.
export function ExpandableRow({ summary, actions, children }: { summary: ReactNode; actions: ReactNode; children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const bodyId = useId();
  return (
    <li className={`overflow-hidden rounded-lg border-2 bg-surface ${isOpen ? "border-ink" : "border-line"}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-canvas">
        <h3 className="min-w-0 flex-1 basis-80">
          <button
            type="button"
            aria-expanded={isOpen}
            aria-controls={bodyId}
            onClick={() => setIsOpen((previous) => !previous)}
            className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 rounded text-left"
          >
            <span className={`transition-transform motion-reduce:transition-none ${isOpen ? "rotate-180" : ""}`}>
              <Icon name="chevron-down" />
            </span>
            {summary}
          </button>
        </h3>
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      </div>
      <div id={bodyId} hidden={!isOpen} className="border-t-2 border-line bg-canvas px-4 py-4">
        {children}
      </div>
    </li>
  );
}
