import * as maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import { layers, LIGHT } from "@protomaps/basemaps";
import type { StyleSpecification } from "maplibre-gl";

// TechDesign/map-workspace.md ("Basemap", R6/R7) + TechDesign/alternatives-and-tradeoffs.md (D10):
// "the Protomaps `pmtiles` extract Caddy serves from the VM's disk... `map-workspace.client.tsx`
// points MapLibre's raster/vector basemap source at that one static URL and nothing else." Caddy
// (deploy/Caddyfile) already serves that one file with byte ranges — pmtiles' whole design is a
// single file read via HTTP range requests, so this registers the `pmtiles://` protocol MapLibre
// needs to read one directly, and builds the matching vector style with Protomaps' own basemap
// layers (`@protomaps/basemaps`) rather than hand-authoring the ~100 paint rules a basemap needs.
let registered = false;

function ensurePmtilesProtocolRegistered(): void {
  if (registered) return;
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  registered = true;
}

/**
 * `basemapUrl` is the one static URL to a `.pmtiles` file — see the module comment above.
 *
 * Text labels (`symbol` layers — street/place names, POI icons) are deliberately dropped: they
 * need font glyphs and sprite icons, and the only source for Protomaps' own fonts/sprites is a
 * live `protomaps.github.io` URL — an always-on third-party runtime dependency this app doesn't
 * otherwise have (system-architecture.md: "few external services", GitHub/Let's Encrypt/OCI only).
 * Everything else — roads, water, parks, buildings, land use — is real vector data from the same
 * downloaded-on-purpose extract Caddy serves (D10) and renders with no external calls at all.
 * Labels are a real, addressable follow-up: bundle the "Noto Sans Regular/Medium/Italic" glyph
 * PBFs from github.com/protomaps/basemaps-assets locally (like the extract itself) and add
 * `glyphs`/`sprite` pointing at that local copy, then stop filtering out `symbol` layers.
 */
export function basemapStyle(basemapUrl: string): StyleSpecification {
  ensurePmtilesProtocolRegistered();
  return {
    version: 8,
    sources: {
      basemap: { type: "vector", url: `pmtiles://${basemapUrl}`, attribution: "© OpenStreetMap" },
    },
    layers: layers("basemap", LIGHT, { lang: "en" }).filter((layer) => layer.type !== "symbol"),
  };
}
