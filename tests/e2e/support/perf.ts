import type { Locator, Page } from "@playwright/test";

import { ms } from "./env";
import { percentile } from "./stats";

// Measuring a page the way a person experiences it: when the first byte came, when something painted, when the
// largest thing painted, how much the page jumped, how long the main thread was busy, how many bytes crossed the
// wire, and when the thing they came for was there to read. All of it from the browser's own Performance API, so
// the numbers are the browser's, not the test runner's.

/** Starts the observers before any page script runs. Call once per page, before the first goto. */
export async function observePerformance(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const perf = { lcp: 0, cls: 0, longTasks: [] as number[] };
    (window as unknown as { __perf: typeof perf }).__perf = perf;
    const watch = (type: string, onEntry: (entry: PerformanceEntry) => void) => {
      try {
        new PerformanceObserver((list) => list.getEntries().forEach(onEntry)).observe({
          type,
          buffered: true,
        });
      } catch {
        // A browser that does not support this entry type reports zero for it; the metric is then absent, not invented.
      }
    };
    watch("largest-contentful-paint", (e) => void (perf.lcp = e.startTime));
    watch("layout-shift", (e) => {
      const shift = e as PerformanceEntry & { value: number; hadRecentInput: boolean };
      if (!shift.hadRecentInput) perf.cls += shift.value;
    });
    watch("longtask", (e) => void perf.longTasks.push(e.duration));
  });
}

export type Weight = {
  requests: number;
  failed: string[];
  totalKb: number;
  jsKb: number;
  cssKb: number;
  imageKb: number;
  fontKb: number;
  slowestMs: number;
  slowestUrl: string;
};

/** Counts every request and the bytes that crossed the wire, by kind, from the moment it is called. */
export function watchWeight(page: Page): { read: () => Promise<Weight>; errors: () => string[] } {
  const pending: Promise<void>[] = [];
  const bytes = { total: 0, script: 0, stylesheet: 0, image: 0, font: 0 };
  let requests = 0;
  let slowestMs = 0;
  let slowestUrl = "";
  const failed: string[] = [];
  const errors: string[] = [];
  page.on("requestfinished", (request) => {
    requests += 1;
    pending.push(
      request.sizes().then((sizes) => {
        const size = sizes.responseBodySize + sizes.responseHeadersSize;
        bytes.total += size;
        const type = request.resourceType();
        if (type === "script" || type === "stylesheet" || type === "image" || type === "font")
          bytes[type] += size;
      }),
    );
    const timing = request.timing();
    const took = timing.responseEnd > 0 ? timing.responseEnd : 0;
    if (took > slowestMs) {
      slowestMs = took;
      slowestUrl = request.url();
    }
  });
  page.on(
    "requestfailed",
    (request) =>
      void failed.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`),
  );
  page.on("pageerror", (error) => void errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return {
    // Sizes arrive after a request finishes; wait for every one so no byte is missed.
    read: async () => {
      await Promise.all(pending);
      return {
        requests,
        failed,
        totalKb: bytes.total / 1024,
        jsKb: bytes.script / 1024,
        cssKb: bytes.stylesheet / 1024,
        imageKb: bytes.image / 1024,
        fontKb: bytes.font / 1024,
        slowestMs,
        slowestUrl,
      };
    },
    errors: () => errors,
  };
}

export type Nav = {
  ttfbMs: number;
  domContentLoadedMs: number;
  loadMs: number;
  fcpMs: number | null;
  lcpMs: number | null;
  cls: number;
  blockingMs: number;
  readyMs: number;
  weight: Weight;
};

/**
 * Loads `path`, waits for `ready` to be visible (the thing the person came for), lets the network settle so the
 * largest paint is final, and reads the browser's numbers. `blockingMs` is total time over 50 ms in long tasks, which
 * is what Total Blocking Time measures.
 */
export async function measureNavigation(page: Page, path: string, ready: Locator): Promise<Nav> {
  const weight = watchWeight(page);
  await page.goto(path, { waitUntil: "commit" });
  await ready.first().waitFor({ state: "visible" });
  const readyMs = await page.evaluate(() => performance.now());
  await page.waitForLoadState("networkidle");

  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    const perf = (window as unknown as { __perf?: { lcp: number; cls: number; longTasks: number[] } })
      .__perf ?? { lcp: 0, cls: 0, longTasks: [] };
    return {
      ttfb: nav ? nav.responseStart : -1,
      dcl: nav ? nav.domContentLoadedEventEnd : -1,
      load: nav ? nav.loadEventEnd : -1,
      fcp: fcp ? fcp.startTime : null,
      lcp: perf.lcp > 0 ? perf.lcp : null,
      cls: perf.cls,
      blocking: perf.longTasks.reduce((sum, d) => sum + Math.max(0, d - 50), 0),
    };
  });
  if (metrics.ttfb < 0)
    throw new Error(`No navigation timing for ${path}: the page was not a document load.`);
  return {
    ttfbMs: metrics.ttfb,
    domContentLoadedMs: metrics.dcl,
    loadMs: metrics.load,
    fcpMs: metrics.fcp,
    lcpMs: metrics.lcp,
    cls: metrics.cls,
    blockingMs: metrics.blocking,
    readyMs,
    weight: await weight.read(),
  };
}

/** One warm-up load (not counted), then `runs` measured loads of the same page. */
export async function measureRepeatedly(
  page: Page,
  path: string,
  ready: Locator,
  runs: number,
): Promise<{ first: Nav; runs: Nav[] }> {
  const first = await measureNavigation(page, path, ready);
  const measured: Nav[] = [];
  for (let i = 0; i < runs; i += 1) measured.push(await measureNavigation(page, path, ready));
  return { first, runs: measured };
}

export const p = (values: number[], q: number): number => percentile(values, q);
export const numbers = (navs: Nav[], pick: (n: Nav) => number | null): number[] =>
  navs.flatMap((n) => {
    const v = pick(n);
    return v === null ? [] : [v];
  });

export type Summary = {
  path: string;
  runs: number;
  ttfbP95: number;
  fcpP95: number | null;
  lcpP95: number | null;
  readyP50: number;
  readyP95: number;
  cls: number;
  blockingP95: number;
  totalKb: number;
  jsKb: number;
  cssKb: number;
  requests: number;
  coldReadyMs: number;
};

export function summarizeNavs(path: string, result: { first: Nav; runs: Nav[] }): Summary {
  const fcp = numbers(result.runs, (n) => n.fcpMs);
  const lcp = numbers(result.runs, (n) => n.lcpMs);
  return {
    path,
    runs: result.runs.length,
    ttfbP95: p(
      result.runs.map((n) => n.ttfbMs),
      95,
    ),
    fcpP95: fcp.length > 0 ? p(fcp, 95) : null,
    lcpP95: lcp.length > 0 ? p(lcp, 95) : null,
    readyP50: p(
      result.runs.map((n) => n.readyMs),
      50,
    ),
    readyP95: p(
      result.runs.map((n) => n.readyMs),
      95,
    ),
    cls: Math.max(...result.runs.map((n) => n.cls)),
    blockingP95: p(
      result.runs.map((n) => n.blockingMs),
      95,
    ),
    totalKb: Math.max(...[result.first, ...result.runs].map((n) => n.weight.totalKb)),
    jsKb: Math.max(...[result.first, ...result.runs].map((n) => n.weight.jsKb)),
    cssKb: Math.max(...[result.first, ...result.runs].map((n) => n.weight.cssKb)),
    requests: Math.max(...[result.first, ...result.runs].map((n) => n.weight.requests)),
    coldReadyMs: result.first.readyMs,
  };
}

/** Time for a click to be followed by a painted change: click, then two animation frames after `done` is true. */
export async function timeInteraction(page: Page, act: () => Promise<void>, done: Locator): Promise<number> {
  const started = await page.evaluate(() => performance.now());
  await act();
  await done.first().waitFor({ state: "visible" });
  const painted = await page.evaluate(
    () =>
      new Promise<number>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now()))),
      ),
  );
  return painted - started;
}

/** JS heap and DOM node count from the browser, after a garbage collection so growth is real growth. */
export async function heap(page: Page): Promise<{ heapMb: number; nodes: number; listeners: number }> {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("Performance.enable");
    await cdp.send("HeapProfiler.collectGarbage");
    const { metrics } = await cdp.send("Performance.getMetrics");
    const get = (name: string) => metrics.find((m) => m.name === name)?.value ?? 0;
    return {
      heapMb: get("JSHeapUsedSize") / 1024 / 1024,
      nodes: get("Nodes"),
      listeners: get("JSEventListeners"),
    };
  } finally {
    await cdp.detach();
  }
}

// --- budgets -----------------------------------------------------------------------------------------------------

export type PageBudget = {
  ttfbMs: number;
  fcpMs: number;
  lcpMs: number;
  readyMs: number;
  blockingMs: number;
  cls: number;
  jsKb: number;
  cssKb: number;
  totalKb: number;
  requests: number;
};

/** A page with no map: forms, tables, text. */
export const LIGHT: PageBudget = {
  ttfbMs: 800,
  fcpMs: 1_800,
  lcpMs: 2_500,
  readyMs: 3_000,
  blockingMs: 300,
  cls: 0.1,
  jsKb: 650,
  cssKb: 90,
  totalKb: 1_000,
  requests: 50,
};
/** A page that draws a map: MapLibre and the basemap's tiles come with it. */
export const MAP: PageBudget = {
  ttfbMs: 800,
  fcpMs: 2_200,
  lcpMs: 3_500,
  readyMs: 4_500,
  blockingMs: 600,
  cls: 0.1,
  jsKb: 1_600,
  cssKb: 120,
  totalKb: 3_500,
  requests: 90,
};

/** Every way a page missed its budget, in words. An empty list is a pass. Times scale with E2E_PERF_SCALE; bytes and shifts do not. */
export function overBudget(s: Summary, b: PageBudget): string[] {
  const out: string[] = [];
  const time = (name: string, got: number | null, limit: number) => {
    if (got !== null && got > ms(limit))
      out.push(`${s.path}: ${name} ${got.toFixed(0)} ms is over ${ms(limit).toFixed(0)} ms`);
  };
  const size = (name: string, got: number, limit: number, unit: string) => {
    if (got > limit)
      out.push(`${s.path}: ${name} ${got.toFixed(got < 10 ? 2 : 0)} ${unit} is over ${limit} ${unit}`);
  };
  time("first byte (p95)", s.ttfbP95, b.ttfbMs);
  time("first contentful paint (p95)", s.fcpP95, b.fcpMs);
  time("largest contentful paint (p95)", s.lcpP95, b.lcpMs);
  time("ready (p95)", s.readyP95, b.readyMs);
  time("main-thread blocking (p95)", s.blockingP95, b.blockingMs);
  size("layout shift", s.cls, b.cls, "");
  size("script transferred", s.jsKb, b.jsKb, "KB");
  size("CSS transferred", s.cssKb, b.cssKb, "KB");
  size("page weight", s.totalKb, b.totalKb, "KB");
  size("requests", s.requests, b.requests, "requests");
  return out;
}
