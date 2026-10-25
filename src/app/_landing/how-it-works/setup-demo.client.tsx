"use client";

import { useState } from "react";
import { Switch } from "react-aria-components";

import { SetupMap } from "./setup-map.client";
import { SETUP_LAYERS, type SetupLayerId } from "./setup-demo.data";

// A small working model of the app's map workspace (site step): the evidence layers as a two-column
// list of title and on-map switch, beside the real OpenStreetMap basemap with the study area, the
// proposal footprint, and a colored shape for every toggle. The shapes are invented static data.
const BASEMAP_URL = "/basemap/basemap.pmtiles";

const HATCH =
  "repeating-linear-gradient(45deg, rgb(0 0 0 / 0.45) 0 2px, transparent 2px 5px)";

export function SetupDemo() {
  const [visible, setVisible] = useState<Record<SetupLayerId, boolean>>(() => {
    const initial = {} as Record<SetupLayerId, boolean>;
    for (const layer of SETUP_LAYERS) initial[layer.id] = layer.initial;
    return initial;
  });

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-[minmax(160px,198px)_minmax(0,1fr)]">
      <div className="flex min-h-0 flex-col">
        <div className="flex items-center justify-between gap-2 pb-2 text-[10px] font-semibold tracking-[0.08em] text-faint uppercase">
          <span>Layer</span>
          <span>On map</span>
        </div>
        <ul className="flex flex-col divide-y divide-line/60 rounded-xl border border-line bg-canvas/60">
          {SETUP_LAYERS.map((layer) => (
            <li key={layer.id} className="flex items-center justify-between gap-2 px-2.5 py-2">
              <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-text">
                <span
                  aria-hidden
                  className="size-3 shrink-0 rounded-[3px] border border-cream/25"
                  style={{
                    backgroundColor: layer.color,
                    backgroundImage: layer.approximate ? HATCH : "none",
                  }}
                />
                <span className="truncate">{layer.label}</span>
              </span>
              <Switch
                isSelected={visible[layer.id]}
                onChange={(next) => setVisible((current) => ({ ...current, [layer.id]: next }))}
                className="group inline-flex cursor-pointer items-center"
              >
                <span className="sr-only">{layer.label} on the map</span>
                <span
                  aria-hidden
                  className="h-4.5 w-8 shrink-0 rounded-full border border-line-strong bg-page transition-colors group-data-[selected]:border-accent-green group-data-[selected]:bg-accent-green group-data-[focus-visible]:outline-3 group-data-[focus-visible]:outline-offset-2 group-data-[focus-visible]:outline-accent-gold"
                >
                  <span className="block size-3 translate-x-0.5 translate-y-0.5 rounded-full bg-muted transition-transform group-data-[selected]:translate-x-4 group-data-[selected]:bg-ink" />
                </span>
              </Switch>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[10px] leading-relaxed text-faint">
          Every layer is also listed as text. Approximate boundaries are hatched, never color alone.
        </p>
      </div>

      <div className="relative min-h-[280px] overflow-hidden rounded-xl border border-line bg-[#1e2716] sm:min-h-[300px]">
        <SetupMap basemapUrl={BASEMAP_URL} visible={visible} />
        <span className="pointer-events-none absolute top-2 left-2 rounded-full border border-line bg-page/85 px-2 py-0.5 font-mono text-[9px] text-muted backdrop-blur">
          OpenStreetMap
        </span>
        <div className="pointer-events-none absolute bottom-8 left-2 flex flex-col gap-1 rounded-lg border border-line bg-page/85 px-2 py-1.5 text-[9px] text-text backdrop-blur">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-0 w-4 border-t-2 border-dashed border-cream" />
            Study area
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-0 w-4 border-t-2 border-accent-gold" />
            Proposal footprint
          </span>
        </div>
      </div>
    </div>
  );
}
