import type { Page } from "@playwright/test";

import { expect, test } from "../support/fixtures";
import { ms } from "../support/env";
import { percentile, seconds } from "../support/stats";

// The evidence layers are served to the map as vector tiles from PostGIS, one request per tile, and the URL names the
// dataset version so a tile never changes (TechDesign/evidence-layers.md R9). That makes tile latency the map's
// latency. This spec finds the sample project's layers, asks for the tiles that cover the pilot city at the zoom
// levels a planner uses, and holds the answers to a budget on time, size, headers, and failure. Tagged @perf.

const CITY: [number, number, number, number] = [-122.06, 47.55, -121.96, 47.65]; // west, south, east, north

const tileX = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
const tileY = (lat: number, z: number) => {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z);
};
/** Up to `limit` tile coordinates that cover the city at zoom `z`. */
function tilesAt(z: number, limit: number): { z: number; x: number; y: number }[] {
  const [west, south, east, north] = CITY;
  const out: { z: number; x: number; y: number }[] = [];
  for (let x = tileX(west, z); x <= tileX(east, z); x += 1) {
    for (let y = tileY(north, z); y <= tileY(south, z); y += 1) out.push({ z, x, y });
  }
  const step = Math.max(1, Math.ceil(out.length / limit));
  return out.filter((_, i) => i % step === 0).slice(0, limit);
}

async function layerIds(page: Page, projectId: string): Promise<string[]> {
  await page.goto(`/projects/${projectId}/evidence`);
  for (const summary of await page.locator("details:not([open]) > summary").all()) await summary.click();
  const hrefs = await page
    .getByRole("link", { name: "Show on map" })
    .evaluateAll((links) => links.map((l) => (l as HTMLAnchorElement).getAttribute("href") ?? ""));
  return [...new Set(hrefs.flatMap((h) => /layer=([0-9a-f-]{36})/.exec(h)?.[1] ?? []))];
}

test.describe("vector tiles", () => {
  test("@perf the sample project has evidence layers to ask for", async ({ page, sharedSampleProject }) => {
    const ids = await layerIds(page, sharedSampleProject.id);
    expect(ids.length, "the Evidence page links at least one layer").toBeGreaterThan(0);
  });

  for (const z of [10, 12, 14, 16]) {
    test(`@perf zoom ${z}: tiles over the city arrive within the budget, in a reasonable size, with the right headers`, async ({
      page,
      request,
      sharedSampleProject,
    }, testInfo) => {
      const [layer] = await layerIds(page, sharedSampleProject.id);
      if (!layer) throw new Error("no evidence layer");
      const times: number[] = [];
      const sizes: number[] = [];
      for (const t of tilesAt(z, 12)) {
        const started = performance.now();
        const response = await request.get(`/api/tiles/${layer}/${t.z}/${t.x}/${t.y}`);
        const body = await response.body();
        times.push(performance.now() - started);
        sizes.push(body.length);
        expect(response.status(), `${t.z}/${t.x}/${t.y}`).toBe(200);
        expect(response.headers()["content-type"]).toBe("application/vnd.mapbox-vector-tile");
        expect(
          response.headers()["cache-control"] ?? "",
          "the URL names the version, so the tile is immutable",
        ).toContain("immutable");
      }
      testInfo.annotations.push({
        type: "tiles",
        description: `z${z}: ${times.length} tiles, p50 ${seconds(percentile(times, 50))}, p95 ${seconds(percentile(times, 95))}, largest ${(Math.max(...sizes) / 1024).toFixed(0)} KB`,
      });
      expect(percentile(times, 95), `z${z} p95`).toBeLessThanOrEqual(ms(z >= 14 ? 1_500 : 2_000));
      expect(Math.max(...sizes) / 1024, `z${z} largest tile (KB)`).toBeLessThanOrEqual(1_024);
    });
  }

  test("@perf the same tile asked twice: the second answer is not slower than the first", async ({
    page,
    request,
    sharedSampleProject,
  }) => {
    const [layer] = await layerIds(page, sharedSampleProject.id);
    if (!layer) throw new Error("no evidence layer");
    const [tile] = tilesAt(13, 1);
    if (!tile) throw new Error("no tile");
    const url = `/api/tiles/${layer}/${tile.z}/${tile.x}/${tile.y}`;
    const times: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const started = performance.now();
      await (await request.get(url)).body();
      times.push(performance.now() - started);
    }
    expect(percentile(times.slice(1), 50), "warm median").toBeLessThanOrEqual(times[0] ?? 0 + ms(300));
  });

  test("@perf twenty tiles at once: none fails, and the slowest is bounded", async ({
    page,
    request,
    sharedSampleProject,
  }) => {
    const [layer] = await layerIds(page, sharedSampleProject.id);
    if (!layer) throw new Error("no evidence layer");
    const wanted = [...tilesAt(12, 8), ...tilesAt(13, 6), ...tilesAt(14, 6)];
    const results = await Promise.all(
      wanted.map(async (t) => {
        const started = performance.now();
        const response = await request.get(`/api/tiles/${layer}/${t.z}/${t.x}/${t.y}`);
        await response.body();
        return { status: response.status(), took: performance.now() - started };
      }),
    );
    expect(results.filter((r) => r.status !== 200).map((r) => r.status)).toEqual([]);
    expect(Math.max(...results.map((r) => r.took)), "slowest of a burst").toBeLessThanOrEqual(ms(8_000));
  });

  test("@perf a tile that cannot exist is refused promptly, not left hanging", async ({ request }) => {
    for (const path of [
      "/api/tiles/not-a-uuid/10/0/0",
      "/api/tiles/00000000-0000-4000-8000-000000000000/10/0/0",
      "/api/tiles/00000000-0000-4000-8000-000000000000/99/0/0",
    ]) {
      const started = performance.now();
      const response = await request.get(path);
      await response.body();
      expect(performance.now() - started, path).toBeLessThanOrEqual(ms(3_000));
      expect(response.status(), path).not.toBe(200);
    }
  });
});
