"use client";

import { Tab, TabList, TabPanel, Tabs } from "react-aria-components";

import { Badge } from "@/ui/badge";

// A small working model of the three analysis views, in the order a planner meets them:
// the screening register, the studies the profile names, and the measured impact. The tabs are
// real ARIA tabs (arrow keys, focus, and roles come with them). Every figure is invented.
const SCREENING = [
  { resource: "Wetlands", finding: "0.42 ac inside the study area", status: "Approximate" },
  { resource: "Streams", finding: "310 ft of mapped stream", status: "Regulatory" },
  { resource: "Forest canopy", finding: "3.1 ac of canopy", status: "Regulatory" },
  { resource: "Steep slopes", finding: "None mapped in the study area", status: "Checked" },
  { resource: "Aquifer recharge", finding: "No usable dataset — not checked", status: "Gap" },
] as const;

const STUDIES = [
  { study: "Wetland delineation", basis: "0.42 ac of mapped wetland in the study area", flagged: true },
  { study: "Geotechnical report", basis: "Steep slopes mapped within 150 ft", flagged: true },
  { study: "Habitat assessment", basis: "3.1 ac of mapped canopy", flagged: true },
  { study: "Floodplain permit", basis: "No mapped floodplain in the study area", flagged: false },
] as const;

const IMPACT = [
  { resource: "Wetlands", value: "0.42 ac", from: 12, to: 12, approx: true },
  { resource: "Wetland buffer", value: "0.9–2.4 ac", from: 24, to: 62, approx: true },
  { resource: "Streams", value: "310 ft", from: 34, to: 34, approx: false },
  { resource: "Forest canopy", value: "3.1 ac", from: 78, to: 78, approx: false },
  { resource: "Steep slopes", value: "0.00 ac", from: 0, to: 0, approx: true },
] as const;

const STATUS_TONE: Record<string, string> = {
  Approximate: "border-accent-gold/45 bg-accent-gold/[0.12] text-accent-gold",
  Regulatory: "border-accent-green/45 bg-accent-green/[0.12] text-accent-lime",
  Checked: "border-cream/25 bg-cream/[0.07] text-text",
  Gap: "border-info/45 bg-info-soft text-info",
};

export function AnalyzeDemo() {
  return (
    <Tabs className="flex min-h-0 flex-1 flex-col" defaultSelectedKey="screening">
      <TabList
        aria-label="Analysis views"
        className="flex shrink-0 gap-1 self-start rounded-full border border-line bg-canvas p-1"
      >
        {[
          ["screening", "Screening"],
          ["studies", "Studies"],
          ["impact", "Impact"],
        ].map(([id, label]) => (
          <Tab
            key={id}
            id={id}
            className="cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold text-muted outline-3 outline-offset-2 outline-transparent transition-colors data-[focus-visible]:outline-accent-gold data-[hovered]:text-text data-[selected]:bg-accent-green data-[selected]:text-ink"
          >
            {label}
          </Tab>
        ))}
      </TabList>

      <TabPanel id="screening" className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-xl border border-line bg-canvas p-3.5">
        <p className="mb-2.5 text-[11px] leading-relaxed text-muted">
          A register of measurements, not a finding. An empty row is a measured zero within a stated
          search distance &mdash; never a clearance.
        </p>
        <ul className="flex flex-col divide-y divide-line/70">
          {SCREENING.map((row) => (
            <li key={row.resource} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-text">{row.resource}</p>
                <p className="text-[11px] text-muted">{row.finding}</p>
              </div>
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_TONE[row.status]}`}
              >
                {row.status}
              </span>
            </li>
          ))}
        </ul>
      </TabPanel>

      <TabPanel id="studies" className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-xl border border-line bg-canvas p-3.5">
        <p className="mb-2.5 text-[11px] leading-relaxed text-muted">
          The city decides which studies an application needs. A flag can add one; the absence of a
          flag never removes one.
        </p>
        <ul className="flex flex-col divide-y divide-line/70">
          {STUDIES.map((row) => (
            <li key={row.study} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-text">{row.study}</p>
                <p className="text-[11px] text-muted">{row.basis}</p>
              </div>
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                  row.flagged
                    ? "border-accent-gold/45 bg-accent-gold/[0.12] text-accent-gold"
                    : "border-cream/25 bg-cream/[0.07] text-text"
                }`}
              >
                {row.flagged ? "Flagged" : "Not flagged"}
              </span>
            </li>
          ))}
        </ul>
      </TabPanel>

      <TabPanel id="impact" className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-xl border border-line bg-canvas p-3.5">
        <p className="mb-2.5 text-[11px] leading-relaxed text-muted">
          What the footprint would remove or disturb. A quantity and its unit &mdash; never
          &ldquo;acceptable&rdquo; or &ldquo;minor.&rdquo;
        </p>
        <ul className="flex flex-col gap-2.5">
          {IMPACT.map((row) => (
            <li key={row.resource}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex items-center gap-2 text-xs font-semibold text-text">
                  {row.resource}
                  {row.approx ? <Badge tone="approximate">Approx.</Badge> : null}
                </span>
                <span className="font-mono text-[11px] font-bold text-heading tabular-nums">{row.value}</span>
              </div>
              <span aria-hidden className="relative mt-1 block h-2 overflow-hidden rounded-full bg-cream/10">
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-accent-lime"
                  style={{ width: `${row.from}%` }}
                />
                {row.to > row.from ? (
                  <span
                    className="absolute inset-y-0 rounded-r-full"
                    style={{
                      left: `${row.from}%`,
                      width: `${row.to - row.from}%`,
                      backgroundColor: "rgb(170 220 110 / 0.14)",
                      backgroundImage:
                        "repeating-linear-gradient(45deg, var(--color-accent-lime) 0 2px, transparent 2px 6px)",
                    }}
                  />
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </TabPanel>
    </Tabs>
  );
}
