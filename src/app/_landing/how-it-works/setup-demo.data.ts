import type { Geometry } from "geojson";

import type { LngLatBounds } from "@/ui/geo-bounds";

// Fixed, invented shapes drawn over a real OpenStreetMap basemap for the landing page's Setup demo.
// They live in one module so the layer list and the map always agree on what a toggle controls.
export type SetupLayerId = "wetlands" | "streams" | "canopy" | "slopes" | "flood" | "aquifer";

export type SetupLayer = {
  id: SetupLayerId;
  label: string;
  color: string;
  approximate: boolean;
  initial: boolean;
  kind: "fill" | "line";
  geometry: Geometry;
};

export const SETUP_BOUNDS: LngLatBounds = [
  [-122.058, 47.578],
  [-122.002, 47.612],
];

const ring = (coordinates: number[][]): Geometry => ({
  type: "Polygon",
  coordinates: [[...coordinates, coordinates[0] ?? []]],
});

export const STUDY_AREA: Geometry = ring([
  [-122.052, 47.584],
  [-122.03, 47.582],
  [-122.018, 47.592],
  [-122.026, 47.605],
  [-122.046, 47.607],
  [-122.056, 47.596],
]);

export const FOOTPRINT: Geometry = ring([
  [-122.043, 47.588],
  [-122.031, 47.587],
  [-122.025, 47.595],
  [-122.033, 47.601],
  [-122.042, 47.598],
]);

export const SETUP_LAYERS: readonly SetupLayer[] = [
  {
    id: "wetlands",
    label: "Wetlands",
    color: "#2a78d6",
    approximate: true,
    initial: true,
    kind: "fill",
    geometry: ring([
      [-122.039, 47.59],
      [-122.034, 47.589],
      [-122.031, 47.592],
      [-122.034, 47.595],
      [-122.039, 47.594],
      [-122.041, 47.592],
    ]),
  },
  {
    id: "streams",
    label: "Streams",
    color: "#1baf7a",
    approximate: false,
    initial: true,
    kind: "line",
    geometry: {
      type: "LineString",
      coordinates: [
        [-122.058, 47.593],
        [-122.05, 47.596],
        [-122.04, 47.594],
        [-122.03, 47.597],
        [-122.02, 47.595],
        [-122.012, 47.598],
      ],
    },
  },
  {
    id: "canopy",
    label: "Forest canopy",
    color: "#008300",
    approximate: false,
    initial: true,
    kind: "fill",
    geometry: {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [-122.038, 47.597],
            [-122.028, 47.597],
            [-122.026, 47.602],
            [-122.036, 47.604],
            [-122.041, 47.601],
            [-122.038, 47.597],
          ],
        ],
        [
          [
            [-122.052, 47.586],
            [-122.046, 47.585],
            [-122.044, 47.59],
            [-122.05, 47.592],
            [-122.052, 47.586],
          ],
        ],
      ],
    },
  },
  {
    id: "flood",
    label: "Frequently flooded",
    color: "#4a3aa7",
    approximate: true,
    initial: false,
    kind: "fill",
    geometry: ring([
      [-122.04, 47.591],
      [-122.022, 47.59],
      [-122.014, 47.596],
      [-122.024, 47.599],
      [-122.038, 47.596],
    ]),
  },
  {
    id: "slopes",
    label: "Steep slopes",
    color: "#eb6834",
    approximate: true,
    initial: false,
    kind: "fill",
    geometry: ring([
      [-122.024, 47.6],
      [-122.018, 47.599],
      [-122.017, 47.604],
      [-122.023, 47.605],
    ]),
  },
  {
    id: "aquifer",
    label: "Aquifer recharge",
    color: "#eda100",
    approximate: true,
    initial: false,
    kind: "fill",
    geometry: ring([
      [-122.056, 47.585],
      [-122.044, 47.583],
      [-122.04, 47.59],
      [-122.048, 47.595],
      [-122.057, 47.593],
    ]),
  },
];
