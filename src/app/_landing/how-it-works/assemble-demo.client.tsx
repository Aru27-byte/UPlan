"use client";

import { Icon } from "@/ui/icons";

// A small working model of the evidence step's figure cards: every number carries its publisher,
// its source date, the date UPlan retrieved it, and a confidence stated in words. The blue box is
// the same disclaimer the app puts above evidence tables. No toggles, no report view — just the
// shape of a sourced figure.
const FIGURES = [
  {
    label: "Forest canopy inside the footprint",
    value: "3.1 ac",
    publisher: "Example State Agency",
    sourceDate: "2021-06-01",
    retrieved: "2026-09-12",
    confidence: "High",
    note: "Recent and fine-scale. A reliable measurement of what the map shows.",
  },
  {
    label: "Wetland area inside the footprint",
    value: "0.42 ac",
    publisher: "County Wetland Inventory",
    sourceDate: "2016-04-18",
    retrieved: "2026-09-12",
    confidence: "Moderate",
    note: "Coarse boundary, several years old. A site study sets the regulated edge.",
  },
  {
    label: "Stream length inside the footprint",
    value: "310 ft",
    publisher: "State Hydrography",
    sourceDate: "2024-08-30",
    retrieved: "2026-09-12",
    confidence: "High",
    note: "Measured in the city's own projection, not a web-map one.",
  },
] as const;

const CONFIDENCE_TONE: Record<string, string> = {
  High: "border-accent-green/45 bg-accent-green/[0.1] text-accent-lime",
  Moderate: "border-accent-gold/45 bg-accent-gold/[0.1] text-accent-gold",
  Low: "border-accent-tan/50 bg-accent-tan/[0.1] text-accent-tan",
};

export function AssembleDemo() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      <div className="rounded-xl border border-info/40 bg-info/[0.12] px-3.5 py-3">
        <p className="flex items-center gap-2 text-xs font-bold tracking-wide text-info uppercase">
          <Icon name="dot" className="size-3.5" />
          Every figure carries its source
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-text">
          These figures describe the mapped record, not the land. Where a dataset is coarse or
          dated, its confidence says so &mdash; and a figure built from several sources lists all of
          them, at the lowest confidence.
        </p>
      </div>

      <div className="flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line bg-canvas">
        {FIGURES.map((figure) => (
          <article key={figure.label} className="flex flex-col gap-2 p-3.5">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[11px] font-semibold tracking-[0.06em] text-muted uppercase">
                {figure.label}
              </p>
              <p className="shrink-0 font-mono text-xl leading-none font-bold text-heading tabular-nums">
                {figure.value}
              </p>
            </div>

            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
              <dt className="text-faint">Publisher</dt>
              <dd className="text-text">{figure.publisher}</dd>
              <dt className="text-faint">Source date</dt>
              <dd className="text-text">{figure.sourceDate} &mdash; the publisher&rsquo;s date</dd>
              <dt className="text-faint">Retrieved</dt>
              <dd className="text-text">{figure.retrieved} &mdash; when UPlan fetched it</dd>
            </dl>

            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span
                className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${CONFIDENCE_TONE[figure.confidence]}`}
              >
                {figure.confidence} confidence
              </span>
              <span className="text-[10px] leading-relaxed text-muted">{figure.note}</span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
