"use client";

import type { ComponentType } from "react";
import { Tab, TabList, TabPanel, Tabs } from "react-aria-components";

import { FootprintPanel } from "./footprint-panel.client";
import { GapsPanel } from "./gaps-panel.client";
import { ImpactPanel } from "./impact-panel.client";
import { ProvenancePanel } from "./provenance-panel.client";
import { ReportPanel } from "./report-panel.client";
import { RulebookPanel } from "./rulebook-panel.client";

// The public landing page's feature showcase: pick a feature on the left, use a small working model
// of it on the right. Every panel is built from invented example data and says so; what each one
// shows is what the feature's Requirements doc says it does. Tabs are React Aria's, so arrow keys,
// focus, and screen-reader roles come with them. Nothing autoplays.
type Feature = {
  id: string;
  title: string;
  blurb: string;
  windowTitle: string;
  detail: string;
  Panel: ComponentType;
};

const FEATURES: readonly Feature[] = [
  {
    id: "footprint",
    title: "Trace what the plan would clear",
    blurb: "Draw the footprint. See what falls inside it.",
    windowTitle: "Proposal footprint",
    detail:
      "Trace the site plan on the map, by pointer or keyboard, with the study area in view. Turn layers on and off to see which ones the footprint touches.",
    Panel: FootprintPanel,
  },
  {
    id: "impact",
    title: "Measure the impact, resource by resource",
    blurb: "Every resource gets a row, and a range where the science isn’t settled.",
    windowTitle: "Impact analysis",
    detail:
      "For each regulated resource and buffer, UPlan measures what the footprint would remove or disturb. Open a row to see the rule and the evidence behind it.",
    Panel: ImpactPanel,
  },
  {
    id: "provenance",
    title: "Every figure shows its source",
    blurb: "Publisher, date, and confidence, on screen and in print.",
    windowTitle: "Provenance",
    detail:
      "“When was this surveyed?” is the first hard question any finding faces. Every number answers it in the same words everywhere it appears.",
    Panel: ProvenancePanel,
  },
  {
    id: "gaps",
    title: "Says what it can’t see",
    blurb: "Disagreements and gaps are stated, never smoothed over.",
    windowTitle: "Evidence base",
    detail:
      "“Nothing on the map” can mean three different things. UPlan keeps them apart, so an empty result never reads as a clearance.",
    Panel: GapsPanel,
  },
  {
    id: "rulebook",
    title: "A rulebook for each city",
    blurb: "Rules live in a profile the city’s planners maintain.",
    windowTitle: "Jurisdiction profile",
    detail:
      "A city’s regulated categories, buffers, and settings are configuration, not code. Planners upload them from Excel, edit them, and choose how each boundary is treated.",
    Panel: RulebookPanel,
  },
  {
    id: "report",
    title: "A report that can’t be quietly changed",
    blurb: "Locked once released, and provably unaltered.",
    windowTitle: "Locked report",
    detail:
      "The report is the product. It carries the evidence, the impact, and what remains uncertain, and it stays exactly as released, for a commission, council, or public records request.",
    Panel: ReportPanel,
  },
];

export function FeatureShowcase() {
  return (
    <Tabs
      orientation="vertical"
      defaultSelectedKey={FEATURES[0]?.id}
      className="grid gap-8 lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)] lg:items-start lg:gap-10"
    >
      <TabList
        aria-label="UPlan features"
        className="-mx-6 flex snap-x gap-3 overflow-x-auto px-6 pt-1 pb-3 sm:-mx-12 sm:px-12 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0"
      >
        {FEATURES.map((feature, index) => (
          <Tab
            key={feature.id}
            id={feature.id}
            className="w-64 shrink-0 cursor-pointer snap-start rounded-xl border border-white/15 bg-white/[0.04] px-5 py-4 text-left outline-2 outline-offset-2 outline-transparent transition-colors data-[focus-visible]:outline-accent-green data-[hovered]:bg-white/[0.09] data-[selected]:border-accent-green data-[selected]:bg-white/[0.12] data-[selected]:shadow-[inset_4px_0_0_0_var(--color-accent-green)] lg:w-auto"
          >
            <span className="eyebrow text-accent-green">{String(index + 1).padStart(2, "0")}</span>
            <span className="text-cream mt-1 block leading-snug font-semibold">{feature.title}</span>
            <span className="text-cream/70 mt-1 block text-sm leading-snug">{feature.blurb}</span>
          </Tab>
        ))}
      </TabList>

      {FEATURES.map(({ id, windowTitle, detail, Panel }) => (
        <TabPanel
          key={id}
          id={id}
          className="showcase-in min-w-0 rounded-2xl outline-2 outline-offset-4 outline-transparent data-[focus-visible]:outline-accent-green"
        >
          <div className="text-ink border-cream/70 bg-cream overflow-hidden rounded-2xl border-2 shadow-[10px_10px_0_0_rgb(139_195_74/0.35)]">
            <div className="bg-cream-soft border-ink/15 flex items-center gap-3 border-b-2 px-4 py-2.5">
              <span aria-hidden className="flex gap-1.5">
                <i className="bg-ink/25 size-2.5 rounded-full" />
                <i className="bg-ink/25 size-2.5 rounded-full" />
                <i className="bg-ink/25 size-2.5 rounded-full" />
              </span>
              <span className="eyebrow text-ink/70">{windowTitle}</span>
              <span className="badge ml-auto">Illustrative example</span>
            </div>
            <div className="flex flex-col gap-5 p-5 sm:p-7">
              <p className="text-ink/80 max-w-prose leading-relaxed">{detail}</p>
              <Panel />
            </div>
          </div>
        </TabPanel>
      ))}
    </Tabs>
  );
}
