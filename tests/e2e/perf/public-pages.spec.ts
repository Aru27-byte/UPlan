import { devices, expect, test, type Locator, type Page, type Response } from "@playwright/test";

import { PERF_RUNS, ms } from "../support/env";
import {
  LIGHT,
  MAP,
  heap,
  measureRepeatedly,
  observePerformance,
  overBudget,
  summarizeNavs,
  watchWeight,
  type PageBudget,
} from "../support/perf";
import { percentile, seconds } from "../support/stats";

// What a visitor who is not signed in feels: the landing page, the sign-in and register forms, the public health
// check, and the basemap. No sign-in and no data are needed, so this runs anywhere the app is reachable. Tagged @perf:
// the budgets are for a production build (see E2E_PERF_SCALE in support/env.ts), so run it against `next start` or a
// deployment, not a dev server.
//
// Every page is measured once to warm it (not counted) and then E2E_PERF_RUNS times. The first load's "ready" time is
// reported as the cold figure. The budgets are asserted on the 95th percentile of the warm runs.

const PAGES: {
  path: string;
  name: string;
  budget: PageBudget;
  ready: (page: Page) => Locator;
}[] = [
  {
    path: "/",
    name: "the landing page",
    budget: MAP,
    ready: (page) => page.getByRole("link", { name: /Launch UPlan/ }),
  },
  {
    path: "/sign-in",
    name: "the sign-in form",
    budget: LIGHT,
    ready: (page) => page.getByRole("button", { name: "Sign in" }),
  },
  {
    path: "/register",
    name: "the register form",
    budget: LIGHT,
    ready: (page) => page.getByRole("button", { name: "Create account" }),
  },
];

test.describe("pages", () => {
  for (const { path, name, budget, ready } of PAGES) {
    test(`@perf ${name} (${path}) meets its budget over ${PERF_RUNS} warm loads`, async ({
      page,
    }, testInfo) => {
      await observePerformance(page);
      const result = await measureRepeatedly(page, path, ready(page), PERF_RUNS);
      const summary = summarizeNavs(path, result);

      await testInfo.attach(`${path.replace(/\W+/g, "_") || "root"}.json`, {
        body: JSON.stringify(summary, null, 2),
        contentType: "application/json",
      });
      testInfo.annotations.push({
        type: "perf",
        description: `${path}: ready p50 ${seconds(summary.readyP50)}, p95 ${seconds(summary.readyP95)}, cold ${seconds(summary.coldReadyMs)}, ${summary.totalKb.toFixed(0)} KB, ${summary.requests} requests`,
      });
      expect(overBudget(summary, budget)).toEqual([]);
    });

    test(`@perf ${name} loads with no failed request and no error in the console`, async ({ page }) => {
      const watch = watchWeight(page);
      await observePerformance(page);
      await page.goto(path);
      await ready(page).first().waitFor({ state: "visible" });
      await page.waitForLoadState("networkidle");

      expect((await watch.read()).failed, "requests that failed").toEqual([]);
      expect(watch.errors(), "errors in the console").toEqual([]);
    });
  }
});

test.describe("delivery", () => {
  test("@perf built files are cached for a year and never revalidated, because their names change with their content", async ({
    page,
  }) => {
    const statics: Response[] = [];
    page.on("response", (response) => {
      if (new URL(response.url()).pathname.startsWith("/_next/static/")) statics.push(response);
    });
    await page.goto("/sign-in");
    await page.waitForLoadState("networkidle");

    expect(statics.length, "the page loaded built files").toBeGreaterThan(0);
    for (const response of statics) {
      const cache = response.headers()["cache-control"] ?? "";
      expect(cache, response.url()).toMatch(/max-age=31536000/);
      expect(cache, response.url()).toContain("immutable");
    }
  });

  test("@perf text responses over 2 KB are compressed on the wire", async ({ page }) => {
    const text: Response[] = [];
    page.on("response", (response) => {
      const type = response.headers()["content-type"] ?? "";
      if (/html|javascript|css|json|svg/.test(type)) text.push(response);
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const uncompressed: string[] = [];
    for (const response of text) {
      const length = Number(response.headers()["content-length"] ?? "0");
      const encoding = response.headers()["content-encoding"] ?? "";
      const body = (await response.body().catch(() => Buffer.alloc(0))).length;
      if (body > 2_048 && !/gzip|br|zstd|deflate/.test(encoding) && length === 0)
        uncompressed.push(`${response.url()} (${body} bytes)`);
    }
    expect(uncompressed, "text over 2 KB sent without compression").toEqual([]);
  });

  test("@perf the map's worker files are small, cacheable, and not redirected", async ({ request }) => {
    for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
      const started = performance.now();
      const response = await request.get(`/maplibre/${file}`, { maxRedirects: 0 });
      const elapsed = performance.now() - started;
      expect(response.status(), file).toBe(200);
      expect(elapsed, `${file} took ${seconds(elapsed)}`).toBeLessThanOrEqual(ms(1_500));
      expect((await response.body()).length / 1024, `${file} size in KB`).toBeLessThanOrEqual(1_200);
    }
  });

  test("@perf the basemap answers a byte-range request with 206, quickly, from a file that supports ranges", async ({
    request,
  }) => {
    const times: number[] = [];
    let last;
    for (let i = 0; i < 6; i += 1) {
      const started = performance.now();
      last = await request.get("/basemap/basemap.pmtiles", {
        headers: { Range: "bytes=0-16383" },
        maxRedirects: 0,
      });
      await last.body();
      times.push(performance.now() - started);
    }
    expect(last?.status()).toBe(206);
    expect(last?.headers()["content-range"]).toMatch(/^bytes 0-16383\/\d+$/);
    expect((await last?.body())?.length).toBe(16_384);
    expect(
      percentile(times.slice(1), 95),
      `p95 ${seconds(percentile(times.slice(1), 95))}`,
    ).toBeLessThanOrEqual(ms(1_000));
    const total = Number(/\/(\d+)$/.exec(last?.headers()["content-range"] ?? "")?.[1] ?? "0");
    expect(total / 1024 / 1024, "the basemap is a small extract, not a planet").toBeLessThanOrEqual(200);
  });

  test("@perf an unknown built file is a fast 404, not a rendered page", async ({ request }) => {
    const started = performance.now();
    const response = await request.get("/_next/static/chunks/does-not-exist.js", { maxRedirects: 0 });
    expect(response.status()).toBe(404);
    expect(performance.now() - started).toBeLessThanOrEqual(ms(800));
  });
});

test.describe("the health check", () => {
  test("@perf thirty requests one after another: p50 and p95 stay low", async ({ request }) => {
    await request.get("/api/health");
    const times: number[] = [];
    for (let i = 0; i < 30; i += 1) {
      const started = performance.now();
      const response = await request.get("/api/health");
      expect([200, 503]).toContain(response.status());
      times.push(performance.now() - started);
    }
    test.info().annotations.push({
      type: "health",
      description: `p50 ${seconds(percentile(times, 50))}, p95 ${seconds(percentile(times, 95))}`,
    });
    expect(percentile(times, 50), "p50").toBeLessThanOrEqual(ms(600));
    expect(percentile(times, 95), "p95").toBeLessThanOrEqual(ms(1_200));
  });

  test("@perf forty requests, ten at a time: none fails and the slowest stays bounded", async ({
    request,
  }) => {
    const times: number[] = [];
    const statuses: number[] = [];
    const started = performance.now();
    for (let round = 0; round < 4; round += 1) {
      await Promise.all(
        Array.from({ length: 10 }, async () => {
          const s = performance.now();
          const response = await request.get("/api/health");
          statuses.push(response.status());
          times.push(performance.now() - s);
        }),
      );
    }
    const wall = performance.now() - started;
    test.info().annotations.push({
      type: "health-burst",
      description: `${(40 / (wall / 1000)).toFixed(1)} req/s; p95 ${seconds(percentile(times, 95))}`,
    });
    expect(
      statuses.filter((s) => s !== 200 && s !== 503),
      "unexpected statuses",
    ).toEqual([]);
    expect(percentile(times, 95), "p95 under a burst").toBeLessThanOrEqual(ms(3_000));
    expect(Math.max(...times), "the slowest request").toBeLessThanOrEqual(ms(8_000));
  });
});

test.describe("sign-in", () => {
  test("@perf a wrong password is answered in under three seconds, from the form to the message", async ({
    page,
  }) => {
    const times: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      await page.goto("/sign-in");
      await page.getByLabel("Email").fill(`nobody-perf-${i}@example.test`);
      await page.getByLabel("Password", { exact: true }).fill("not-the-password");
      const started = performance.now();
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.locator("form").getByRole("alert").waitFor({ state: "visible" });
      times.push(performance.now() - started);
    }
    expect(Math.max(...times), `slowest ${seconds(Math.max(...times))}`).toBeLessThanOrEqual(ms(3_000));
  });
});

test.describe("memory", () => {
  test("@perf the landing page, map and all, stays under 150 MB of JavaScript heap and 10,000 DOM nodes", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const { heapMb, nodes } = await heap(page);

    test
      .info()
      .annotations.push({ type: "memory", description: `${heapMb.toFixed(1)} MB heap, ${nodes} nodes` });
    expect(heapMb, "the heap was read").toBeGreaterThan(1);
    expect(nodes, "the DOM was counted").toBeGreaterThan(50);
    expect(heapMb).toBeLessThanOrEqual(150);
    expect(nodes).toBeLessThanOrEqual(10_000);
  });
});

// A phone on a bad connection is a real planner at a site visit (charter: planners look up a decision on a phone).
// 4x slower CPU and a "slow 4G" network, through the browser's own throttling.
const { userAgent, viewport, deviceScaleFactor, isMobile, hasTouch } = devices["Pixel 7"];
const pixel = { userAgent, viewport, deviceScaleFactor, isMobile, hasTouch };

test.describe("a phone on slow 4G with a slow CPU", () => {
  test.use({ ...pixel });

  const PHONE: PageBudget = { ...LIGHT, fcpMs: 4_000, lcpMs: 6_000, readyMs: 7_000, blockingMs: 1_200 };
  const PHONE_MAP: PageBudget = { ...MAP, fcpMs: 5_000, lcpMs: 8_000, readyMs: 10_000, blockingMs: 2_400 };

  for (const { path, name, budget, ready } of PAGES) {
    test(`@perf ${name} (${path}) is usable on a throttled phone`, async ({ page }, testInfo) => {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 150,
        downloadThroughput: (1.6 * 1024 * 1024) / 8,
        uploadThroughput: (750 * 1024) / 8,
      });
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await observePerformance(page);

      const result = await measureRepeatedly(page, path, ready(page), 2);
      const summary = summarizeNavs(path, result);
      testInfo.annotations.push({
        type: "phone",
        description: `${path}: LCP ${seconds(summary.lcpP95 ?? 0)}, ready ${seconds(summary.readyP95)}`,
      });
      expect(overBudget(summary, budget === MAP ? PHONE_MAP : PHONE)).toEqual([]);
      const sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(sideways, "the page scrolls sideways on a phone").toBe(false);
    });
  }
});
