// TechDesign/map-workspace.md, R2: an approximate boundary is never styled with color alone —
// always paired with the hatch pattern too, so it survives grayscale printing (P2). Fixed in one
// file so no layer can be wired up without both.
export type MapStatus = "regulatory" | "approximate";

export const RESOURCE_TYPE_PAINT: Record<
  MapStatus,
  { fillOpacity: number; fillColor: string; fillPattern: string | null }
> = {
  regulatory: { fillOpacity: 0.35, fillColor: "#1d4ed8", fillPattern: null },
  approximate: { fillOpacity: 0.35, fillColor: "#b45309", fillPattern: "hatch-diagonal" },
};

export function paintFor(mapStatus: MapStatus) {
  return RESOURCE_TYPE_PAINT[mapStatus];
}
