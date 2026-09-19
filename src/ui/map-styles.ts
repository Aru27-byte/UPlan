// TechDesign/map-workspace.md, R2: an approximate boundary is never styled with color alone —
// always paired with a hatch pattern too, so it survives grayscale printing (P2). Fixed in one
// file so no layer can be wired up without both.
export type MapStatus = "regulatory" | "approximate";

// A validated categorical palette (dataviz skill, references/palette.md): eight hues in a fixed
// order that clears CVD-safety and contrast checks for adjacent pairs in both light and dark mode.
// Identity is never carried by hue alone regardless — every layer also has a name and status badge
// next to its swatch — but this keeps a jurisdiction's resource types visually distinct at a glance
// instead of the old two-color (regulatory/approximate) scheme, which gave every layer of the same
// status an identical color.
export const CATEGORICAL_PALETTE = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#008300", // green
  "#4a3aa7", // violet
  "#e34948", // red
] as const;

/** Cycles through the fixed palette order by position — never reassigned when a filter changes which layers are shown. */
export function layerColor(index: number): string {
  const color = CATEGORICAL_PALETTE[index % CATEGORICAL_PALETTE.length];
  if (!color) throw new Error("invariant violated: index % CATEGORICAL_PALETTE.length is always in range");
  return color;
}

/** A darker, tone-on-tone step of the same hue, for the hatch texture drawn on top of it. */
export function darken(hex: string, factor: number): string {
  const channel = (start: number) => Math.round(parseInt(hex.slice(start, start + 2), 16) * factor);
  const hex2 = (v: number) => v.toString(16).padStart(2, "0");
  return `#${hex2(channel(1))}${hex2(channel(3))}${hex2(channel(5))}`;
}

export type LayerPaint = {
  fillOpacity: number;
  fillColor: string;
  /** Non-null only for "approximate" — the hatch texture is drawn in this tone-on-tone shade of fillColor. */
  patternColor: string | null;
};

export function paintFor(mapStatus: MapStatus, color: string): LayerPaint {
  return {
    fillOpacity: mapStatus === "approximate" ? 1 : 0.4,
    fillColor: color,
    patternColor: mapStatus === "approximate" ? darken(color, 0.55) : null,
  };
}
