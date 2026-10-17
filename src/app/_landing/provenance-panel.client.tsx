"use client";

import { useState } from "react";

import { Segmented } from "./segmented.client";

// One landing-showcase panel: a single figure with its provenance block, shown "on screen" and "in
// the report" with the same words in both (provenance.md R8), and a confidence level a visitor can
// change to see it stated in plain language (R7) instead of as a score. Every value is invented.
type Mode = "screen" | "print";
type Confidence = "high" | "moderate" | "low";

const MODES: readonly { id: Mode; label: string }[] = [
  { id: "screen", label: "On screen" },
  { id: "print", label: "In the report" },
];

const CONFIDENCE_LABEL: Record<Confidence, string> = { high: "High", moderate: "Moderate", low: "Low" };

const CONFIDENCE: readonly { id: Confidence; label: string }[] = [
  { id: "high", label: CONFIDENCE_LABEL.high },
  { id: "moderate", label: CONFIDENCE_LABEL.moderate },
  { id: "low", label: CONFIDENCE_LABEL.low },
];

const CONFIDENCE_MEANING: Record<Confidence, string> = {
  high: "The publisher's data is recent and fine-scale for this area. The figure is a reliable measurement of what the map shows.",
  moderate: "The data is usable but coarse, or several years old. Read the figure as approximate.",
  low: "The data is coarse, old, or incomplete here. Use the figure to know where to look closer, not as a measurement.",
};

export function ProvenancePanel() {
  const [mode, setMode] = useState<Mode>("screen");
  const [confidence, setConfidence] = useState<Confidence>("high");

  const rows: readonly (readonly [string, string])[] = [
    ["Publisher", "Example State Agency"],
    ["License", "Open data"],
    ["Source date", "2021-06-01 — the publisher's date"],
    ["Retrieved by UPlan", "2026-09-12 — when we fetched it"],
  ];
  // On screen the figure sits on a dark card; in the report it is printed on white paper.
  const quiet = mode === "screen" ? "text-muted" : "text-ink/75";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Segmented label="Where the figure appears" value={mode} options={MODES} onChange={setMode} />
        <Segmented label="Confidence level" value={confidence} options={CONFIDENCE} onChange={setConfidence} />
      </div>

      <div
        className={
          mode === "screen"
            ? "rounded-2xl border border-line bg-canvas p-5 text-text transition-all sm:p-6"
            : "rounded-sm border border-line bg-white p-5 font-serif text-ink shadow-panel transition-all sm:p-6"
        }
      >
        <p className={`eyebrow ${quiet}`}>Forest canopy inside the footprint</p>
        <p className="mt-1 font-mono text-5xl font-bold tabular-nums">3.1 ac</p>

        <dl className="mt-5 grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-[auto_1fr]">
          {rows.map(([term, description]) => (
            <div key={term} className="contents">
              <dt className={`font-semibold ${quiet}`}>{term}</dt>
              <dd>{description}</dd>
            </div>
          ))}
          <dt className={`font-semibold ${quiet}`}>Confidence</dt>
          <dd>
            <span className={mode === "screen" ? "badge" : "rounded-full border border-ink/50 px-3 py-0.5 font-sans text-xs font-semibold"}>
              {CONFIDENCE_LABEL[confidence]}
            </span>
            <span className="mt-2 block" aria-live="polite">
              {CONFIDENCE_MEANING[confidence]}
            </span>
          </dd>
        </dl>
      </div>

      <p className="text-xs text-muted">
        The source date and the retrieval date are never mixed up. A figure built from several sources
        lists every one and shows the lowest confidence among them.
      </p>
    </div>
  );
}
