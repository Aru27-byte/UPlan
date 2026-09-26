"use client";

import { useState } from "react";

import { layerColor } from "@/ui/map-styles";

import { Segmented } from "./segmented.client";

// One landing-showcase panel: a city's profile — its regulated categories and the map-status setting
// a planner chooses for each (jurisdiction-profile.md, F1). A visitor flips a boundary between
// regulatory and approximate and watches its swatch pick up the hatch that always accompanies
// "approximate" (map-workspace.md R2: never color alone). The six types are Sammamish's own; the
// starting settings are invented.
type Status = "regulatory" | "approximate";

const STATUS_OPTIONS: readonly { id: Status; label: string }[] = [
  { id: "regulatory", label: "Regulatory" },
  { id: "approximate", label: "Approximate" },
];

type TypeId = "wetlands" | "streams" | "habitat" | "hazard" | "flood" | "aquifer";

// `color` indexes the app's fixed layer palette, so a resource is the same color here as in the
// footprint panel and on the real map.
const TYPES: readonly { id: TypeId; name: string; color: number }[] = [
  { id: "wetlands", name: "Wetlands", color: 0 },
  { id: "streams", name: "Streams", color: 2 },
  { id: "habitat", name: "Habitat conservation areas and migration corridors", color: 5 },
  { id: "hazard", name: "Geologically hazardous areas", color: 1 },
  { id: "flood", name: "Frequently flooded areas", color: 6 },
  { id: "aquifer", name: "Critical aquifer recharge areas", color: 4 },
];

const STEPS = ["Download the Excel template", "Upload and validate", "Preview against open decisions", "Approve", "In force"];

const HATCH = "repeating-linear-gradient(45deg, rgb(0 0 0 / 0.45) 0 2px, transparent 2px 5px)";

export function RulebookPanel() {
  const [statuses, setStatuses] = useState<Record<TypeId, Status>>({
    wetlands: "regulatory",
    streams: "regulatory",
    habitat: "approximate",
    hazard: "approximate",
    flood: "approximate",
    aquifer: "approximate",
  });

  return (
    <div className="flex flex-col gap-5">
      <ul className="flex flex-col gap-2">
        {TYPES.map((type) => {
          const status = statuses[type.id];
          return (
            <li
              key={type.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border-2 border-ink bg-white px-4 py-2.5"
            >
              <span
                aria-hidden
                className="size-5 shrink-0 rounded border border-ink/50"
                style={{
                  backgroundColor: layerColor(type.color),
                  backgroundImage: status === "approximate" ? HATCH : "none",
                }}
              />
              <span className="min-w-0 flex-1 text-sm font-semibold">{type.name}</span>
              <Segmented
                label={`Map status for ${type.name}`}
                value={status}
                options={STATUS_OPTIONS}
                onChange={(next) => setStatuses((current) => ({ ...current, [type.id]: next }))}
              />
            </li>
          );
        })}
      </ul>

      <p className="text-sm text-ink/75">
        Every rule cites its code section and the date it took effect. A planner sets each boundary as
        regulatory or approximate; approximate ones are always hatched, never distinguished by color alone.
      </p>

      <ol className="flex flex-wrap gap-2 text-xs font-semibold" aria-label="How a city's rules get into UPlan">
        {STEPS.map((step, index) => (
          <li key={step} className="flex items-center gap-2 rounded-full bg-ink px-3 py-1.5 text-cream">
            <span className="text-accent-green">{index + 1}</span>
            {step}
          </li>
        ))}
      </ol>
    </div>
  );
}
