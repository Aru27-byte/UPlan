"use client";

import { useState } from "react";

import { Segmented } from "./segmented.client";

// One landing-showcase panel: the three different things "nothing on the map" can mean, and how
// UPlan keeps them apart (evidence-base.md R3, R4, R7; charter P2). A visitor picks a case and sees
// how it's stated. The datasets and statuses are invented.
type Case = "disagree" | "gap" | "none";

const CASES: readonly { id: Case; label: string }[] = [
  { id: "disagree", label: "Datasets disagree" },
  { id: "gap", label: "A gap" },
  { id: "none", label: "Checked, none found" },
];

type Line = { source: string; says: string; tone: "present" | "absent" | "unknown" };

const SCENARIOS: Record<Case, { heading: string; lines: readonly Line[]; result: string; badge: string }> = {
  disagree: {
    heading: "Wetlands",
    lines: [
      { source: "State wetland inventory", says: "Wetland mapped here", tone: "present" },
      { source: "County critical areas map", says: "No wetland here", tone: "absent" },
    ],
    result: "Both are shown, side by side. UPlan never picks the “right” one for you.",
    badge: "Disagreement",
  },
  gap: {
    heading: "Critical aquifer recharge areas",
    lines: [{ source: "No dataset mapped for this resource", says: "Not checked", tone: "unknown" }],
    result: "Shown as a gap, in its own row. It is not “none found,” because nothing was looked at.",
    badge: "Gap",
  },
  none: {
    heading: "Steep slopes",
    lines: [{ source: "Slope dataset covers the whole study area", says: "No features mapped inside", tone: "absent" }],
    result:
      "Stated as exactly that: “No mapped steep slopes in the study area.” A desk screen can miss what no map shows, so it never reads as “clear to develop” or “no study needed.”",
    badge: "Checked",
  },
};

const DOT: Record<Line["tone"], string> = {
  present: "bg-status-regulatory",
  absent: "bg-ink/40",
  unknown: "border-2 border-dashed border-ink/50 bg-transparent",
};

export function GapsPanel() {
  const [chosen, setChosen] = useState<Case>("disagree");
  const scenario = SCENARIOS[chosen];

  return (
    <div className="flex flex-col gap-5">
      <Segmented label="Kind of result" value={chosen} options={CASES} onChange={setChosen} />

      <div key={chosen} className="showcase-in card-sticker flex flex-col gap-4 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-lg font-bold">{scenario.heading}</h3>
          <span className="badge">{scenario.badge}</span>
        </div>
        <ul className="flex flex-col gap-2.5">
          {scenario.lines.map((line) => (
            <li key={line.source} className="flex items-center gap-3 rounded-lg bg-cream-soft px-4 py-3 text-sm">
              <span aria-hidden className={`size-3 shrink-0 rounded-full ${DOT[line.tone]}`} />
              <span className="font-semibold">{line.source}</span>
              <span className="ml-auto text-right text-ink/75">{line.says}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm leading-relaxed" aria-live="polite">
          {scenario.result}
        </p>
      </div>

      <p className="text-xs text-ink/75">
        Where a dataset has a known blind spot, such as canopy data that can&rsquo;t show individual trees,
        that limit is stated wherever the resource appears.
      </p>
    </div>
  );
}
