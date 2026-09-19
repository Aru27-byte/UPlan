// MapLibre GL JS 6 moved vector-tile parsing into a real ES module Worker, loaded from a URL the
// app must point at explicitly (`maplibregl.setWorkerUrl(...)`, in basemap-style.client.ts) — see
// TechDesign/alternatives-and-tradeoffs.md's D10 note. Copying the two files a bundled app needs
// (the worker itself, and the shared chunk it imports) out of node_modules and into public/ at
// install time is simpler and more robust than teaching Turbopack to treat a .mjs import as a
// fingerprinted static asset (there is no Next.js equivalent of Vite's `?url` suffix for this).
//
//   npx tsx scripts/copy-maplibre-worker.ts
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const srcDir = join("node_modules", "maplibre-gl", "dist");
const destDir = join("public", "maplibre");

mkdirSync(destDir, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(join(srcDir, file), join(destDir, file));
}
console.log(`copied MapLibre's worker files into ${destDir}`);
