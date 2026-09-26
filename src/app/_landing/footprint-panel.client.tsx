"use client";

import { useState } from "react";
import { ToggleButton, ToggleButtonGroup, type Key } from "react-aria-components";

import { layerColor } from "@/ui/map-styles";

// One landing-showcase panel: an illustrative map (invented shapes, not real data) that lets a
// visitor turn layers on and off and see which ones fall inside a traced footprint. The highlight
// inside the footprint is the same layer drawn again, clipped to the footprint — which is what
// UPlan's impact measurement does, only in PostGIS and with real geometry.
type LayerId = "canopy" | "wetlands" | "streams" | "slopes";

const LAYERS: readonly { id: LayerId; label: string; color: string; isInside: boolean }[] = [
  { id: "wetlands", label: "Wetlands", color: layerColor(0), isInside: true },
  { id: "streams", label: "Stream buffer", color: layerColor(2), isInside: true },
  { id: "canopy", label: "Forest canopy", color: layerColor(5), isInside: true },
  { id: "slopes", label: "Steep slopes", color: layerColor(1), isInside: false },
];

const STUDY_AREA = "M40 30 L440 30 L446 276 L34 276 Z";
const FOOTPRINT = "M170 96 L330 90 L346 216 L200 232 L160 170 Z";
const VERTICES: readonly (readonly [number, number])[] = [
  [170, 96],
  [330, 90],
  [346, 216],
  [200, 232],
  [160, 170],
];

function LayerShape({ id, color, opacity }: { id: LayerId; color: string; opacity: number }) {
  switch (id) {
    case "canopy":
      return (
        <g opacity={opacity} fill={color}>
          <path d="M20 44 C80 12 160 30 192 80 C214 130 150 172 90 162 C40 152 2 100 20 44 Z" />
          <path d="M300 192 C360 160 452 180 462 242 C466 286 380 296 330 276 C290 256 270 216 300 192 Z" />
        </g>
      );
    case "wetlands":
      return (
        <path
          opacity={opacity}
          fill={color}
          d="M195 120 C225 100 275 110 285 145 C293 178 250 195 218 185 C190 176 175 140 195 120 Z"
        />
      );
    case "streams":
      return (
        <path
          opacity={opacity}
          fill="none"
          stroke={color}
          strokeWidth={34}
          strokeLinecap="round"
          d="M0 214 C90 194 150 254 240 218 C330 182 380 242 480 202"
        />
      );
    case "slopes":
      return <path opacity={opacity} fill="url(#showcase-slopes)" d="M360 40 L452 56 L440 118 L370 102 Z" />;
  }
}

export function FootprintPanel() {
  const [shown, setShown] = useState<Set<Key>>(() => new Set(LAYERS.map((layer) => layer.id)));

  return (
    <div className="flex flex-col gap-5">
      <ToggleButtonGroup
        aria-label="Map layers"
        selectionMode="multiple"
        selectedKeys={shown}
        onSelectionChange={setShown}
        className="flex flex-wrap gap-2"
      >
        {LAYERS.map((layer) => (
          <ToggleButton
            key={layer.id}
            id={layer.id}
            className="flex cursor-pointer items-center gap-2 rounded-full border-2 border-ink bg-white px-3.5 py-1.5 text-sm font-semibold outline-2 outline-offset-2 outline-transparent transition-colors data-[focus-visible]:outline-ink data-[hovered]:bg-ink/10 data-[selected]:bg-ink data-[selected]:text-cream"
          >
            <span aria-hidden className="size-3 rounded-full border border-cream/60" style={{ backgroundColor: layer.color }} />
            {layer.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      <svg
        viewBox="0 0 480 300"
        role="img"
        aria-label="Illustrative map: a footprint traced inside a study area. Wetlands, a stream buffer and forest canopy overlap the footprint; steep slopes lie outside it."
        className="w-full rounded-xl border-2 border-ink bg-[#ece7d8]"
      >
        <defs>
          <clipPath id="showcase-footprint">
            <path d={FOOTPRINT} />
          </clipPath>
          <pattern id="showcase-slopes" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="8" height="8" fill={layerColor(1)} fillOpacity={0.35} />
            <line x1="0" y1="0" x2="0" y2="8" stroke={layerColor(1)} strokeWidth="3" />
          </pattern>
        </defs>

        <path d="M0 118 C120 98 240 142 480 108" fill="none" stroke="#fff" strokeWidth={6} opacity={0.85} />
        <path d="M300 0 C285 90 320 200 300 300" fill="none" stroke="#fff" strokeWidth={5} opacity={0.85} />

        {LAYERS.filter((layer) => shown.has(layer.id)).map((layer) => (
          <LayerShape key={layer.id} id={layer.id} color={layer.color} opacity={0.32} />
        ))}

        <path d={STUDY_AREA} fill="none" stroke="#211c14" strokeWidth={2} strokeDasharray="8 6" />
        <path d={FOOTPRINT} fill="#eab676" fillOpacity={0.4} className="showcase-fill" />
        <g clipPath="url(#showcase-footprint)">
          {LAYERS.filter((layer) => shown.has(layer.id)).map((layer) => (
            <LayerShape key={layer.id} id={layer.id} color={layer.color} opacity={0.9} />
          ))}
        </g>
        <path
          d={FOOTPRINT}
          pathLength={1}
          fill="none"
          stroke="#211c14"
          strokeWidth={3}
          strokeLinejoin="round"
          className="showcase-draw"
        />
        {VERTICES.map(([x, y], index) => (
          <circle
            key={index}
            cx={x}
            cy={y}
            r={5}
            fill="#fff"
            stroke="#211c14"
            strokeWidth={2.5}
            className="showcase-pop"
            style={{ animationDelay: `${index * 0.28}s` }}
          />
        ))}
        <text x="46" y="268" fontSize="11" fontWeight="600" fill="#211c14" opacity={0.7}>
          Study area
        </text>
      </svg>

      <ul className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {LAYERS.map((layer) => (
          <li key={layer.id} className="flex items-baseline gap-2">
            <span aria-hidden className="size-2.5 shrink-0 translate-y-px rounded-full" style={{ backgroundColor: layer.color }} />
            <span>
              <strong className="font-semibold">{layer.label}:</strong>{" "}
              {!shown.has(layer.id)
                ? "hidden"
                : layer.isInside
                  ? "falls inside the footprint"
                  : "none mapped inside the footprint"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
