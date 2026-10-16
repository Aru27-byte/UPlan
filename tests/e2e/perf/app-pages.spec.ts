import type { Locator, Page } from "@playwright/test";

import { STAGES, stageLink, type Step } from "../support/app";
import { PERF_RUNS, ms } from "../support/env";
import { expect, test } from "../support/fixtures";
import {
  LIGHT,
  MAP,
  measureRepeatedly,
  observePerformance,
  overBudget,
  summarizeNavs,
  timeInteraction,
  type PageBudget,
} from "../support/perf";
import { percentile, seconds } from "../support/stats";

// What a signed-in planner feels, screen by screen: first byte (the server reading the database), first and largest
// paint, how long until the thing they came for is on screen, how many bytes and requests it took, and how long it
// takes to move between screens inside the app. Tagged @perf; the budgets are for production (E2E_PERF_SCALE).
// Needs E2E_EMAIL / E2E_PASSWORD, a seeded city, and for the sample project's pages the worker.

type Target = {
  name: string;
  path: (id: string) => string;
  budget: PageBudget;
  ready: (page: Page) => Locator;
};

const heading = (name: string) => (page: Page) => page.getByRole("heading", { name, exact: true });
const section = (title: string) => (page: Page) =>
  page.getByRole("region", { name: `Report section produced by ${title}` });

const SHELL_PAGES: Target[] = [
  {
    name: "the dashboard",
    path: () => "/dashboard",
    budget: LIGHT,
    ready: (page) => page.getByRole("heading", { level: 1 }),
  },
  { name: "new research", path: () => "/projects/new", budget: LIGHT, ready: heading("Project details") },
  { name: "Help", path: () => "/help", budget: LIGHT, ready: heading("What UPlan does") },
  {
    name: "the city profile",
    path: () => "/profile",
    budget: LIGHT,
    ready: (page) => page.getByRole("heading", { level: 1 }),
  },
];

const STEP_READY: Record<Step, (page: Page) => Locator> = {
  overview: section("Overview"),
  site: section("Site"),
  evidence: section("Evidence"),
  screening: section("Screening"),
  studies: section("Studies"),
  footprint: section("Footprint"),
  impact: section("Impact"),
  report: heading("Document versions"),
};
const MAP_STEPS = new Set<Step>(["site", "footprint"]);

test.describe("shell pages", () => {
  for (const target of SHELL_PAGES) {
    test(`@perf ${target.name} meets its budget over ${PERF_RUNS} warm loads`, async ({ page }, testInfo) => {
      await observePerformance(page);
      const result = await measureRepeatedly(page, target.path(""), target.ready(page), PERF_RUNS);
      const summary = summarizeNavs(target.path(""), result);

      await testInfo.attach("summary.json", {
        body: JSON.stringify(summary, null, 2),
        contentType: "application/json",
      });
      testInfo.annotations.push({
        type: "perf",
        description: `${summary.path}: first byte p95 ${seconds(summary.ttfbP95)}, ready p95 ${seconds(summary.readyP95)}, ${summary.totalKb.toFixed(0)} KB`,
      });
      expect(overBudget(summary, target.budget)).toEqual([]);
    });
  }
});

test.describe("a project with nothing in it", () => {
  for (const { step, title } of STAGES) {
    test(`@perf ${title} meets its budget`, async ({ page, sharedBlankProject }, testInfo) => {
      await observePerformance(page);
      const path = `/projects/${sharedBlankProject.id}/${step}`;
      const result = await measureRepeatedly(page, path, STEP_READY[step](page), PERF_RUNS);
      const summary = summarizeNavs(`/projects/<id>/${step}`, result);

      testInfo.annotations.push({
        type: "perf",
        description: `${step}: first byte p95 ${seconds(summary.ttfbP95)}, ready p95 ${seconds(summary.readyP95)}`,
      });
      expect(overBudget(summary, MAP_STEPS.has(step) ? MAP : LIGHT)).toEqual([]);
    });
  }
});

test.describe("a project with an analysis", () => {
  // The pages that carry the most: every resource type's cards, the whole register, every measured impact.
  for (const { step, title } of STAGES) {
    test(`@perf ${title}, with data, meets its budget`, async ({ page, sharedSampleProject }, testInfo) => {
      await observePerformance(page);
      const path = `/projects/${sharedSampleProject.id}/${step}`;
      const result = await measureRepeatedly(page, path, STEP_READY[step](page), PERF_RUNS);
      const summary = summarizeNavs(`/projects/<sample>/${step}`, result);

      testInfo.annotations.push({
        type: "perf",
        description: `${step}: first byte p95 ${seconds(summary.ttfbP95)}, ready p95 ${seconds(summary.readyP95)}, ${summary.totalKb.toFixed(0)} KB, ${summary.requests} requests`,
      });
      expect(overBudget(summary, MAP_STEPS.has(step) ? MAP : LIGHT)).toEqual([]);
    });
  }

  test("@perf the server's share: the data-heavy pages answer their first byte within 1.5 seconds, with the database in the path", async ({
    page,
    sharedSampleProject,
  }) => {
    const times: Record<string, number> = {};
    for (const step of ["evidence", "screening", "studies", "impact", "report"] as const) {
      const runs: number[] = [];
      for (let i = 0; i < 4; i += 1) {
        const response = await page.request.get(`/projects/${sharedSampleProject.id}/${step}`);
        expect(response.status()).toBe(200);
        const started = performance.now();
        await response.body();
        runs.push(performance.now() - started);
      }
      times[step] = percentile(runs, 95);
    }
    test.info().annotations.push({
      type: "body-time",
      description: Object.entries(times)
        .map(([k, v]) => `${k} ${seconds(v)}`)
        .join(", "),
    });
    for (const [step, took] of Object.entries(times)) expect(took, step).toBeLessThanOrEqual(ms(1_500));
  });
});

test.describe("moving between screens inside the app", () => {
  test("@perf clicking through the stage rail: each step is on screen within the budget", async ({
    page,
    sharedSampleProject,
  }, testInfo) => {
    await page.goto(`/projects/${sharedSampleProject.id}/overview`);
    await STEP_READY.overview(page).waitFor({ state: "visible" });
    const byStep = new Map<Step, number[]>();
    for (let lap = 0; lap < 3; lap += 1) {
      for (const { step, title } of STAGES.filter((s) => s.step !== "overview")) {
        const took = await timeInteraction(
          page,
          () => stageLink(page, title).click(),
          STEP_READY[step](page),
        );
        byStep.set(step, [...(byStep.get(step) ?? []), took]);
      }
      await timeInteraction(page, () => stageLink(page, "Overview").click(), STEP_READY.overview(page));
    }
    const rows = [...byStep].map(([step, times]) => ({
      step,
      p50: percentile(times, 50),
      p95: percentile(times, 95),
    }));
    await testInfo.attach("stage-rail.json", {
      body: JSON.stringify(rows, null, 2),
      contentType: "application/json",
    });
    testInfo.annotations.push({
      type: "client-nav",
      description: rows.map((r) => `${r.step} ${seconds(r.p95)}`).join(", "),
    });
    for (const r of rows) expect(r.p95, `${r.step} p95`).toBeLessThanOrEqual(ms(2_000));
  });

  test("@perf the shell's links: Dashboard, Help, and City profile are each on screen within the budget", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    const times: number[] = [];
    const nav = page.getByRole("navigation", { name: "Main" });
    for (let lap = 0; lap < 3; lap += 1) {
      times.push(
        await timeInteraction(
          page,
          () => nav.getByRole("link", { name: /Help/ }).click(),
          page.getByRole("heading", { name: "What UPlan does" }),
        ),
      );
      times.push(
        await timeInteraction(
          page,
          () => nav.getByRole("link", { name: /City profile/ }).click(),
          page.getByRole("heading", { name: "City Resource Types" }),
        ),
      );
      times.push(
        await timeInteraction(
          page,
          () => nav.getByRole("link", { name: /Dashboard/ }).click(),
          page.getByRole("heading", { name: /Welcome back/ }),
        ),
      );
    }
    expect(percentile(times, 95), `p95 ${seconds(percentile(times, 95))}`).toBeLessThanOrEqual(ms(2_000));
  });

  test("@perf opening a project from the dashboard and coming back", async ({ page, sharedBlankProject }) => {
    const times: number[] = [];
    for (let lap = 0; lap < 3; lap += 1) {
      await page.goto("/dashboard");
      const row = page
        .getByRole("listitem")
        .filter({ has: page.getByRole("button", { name: `Delete research: ${sharedBlankProject.title}` }) });
      times.push(
        await timeInteraction(
          page,
          () => row.getByRole("link", { name: `Resume research: ${sharedBlankProject.title}` }).click(),
          page.getByRole("region", { name: /Report section produced by/ }),
        ),
      );
      times.push(
        await timeInteraction(
          page,
          () =>
            page
              .getByRole("navigation", { name: "Breadcrumb" })
              .getByRole("link", { name: "Dashboard" })
              .click(),
          page.getByRole("heading", { name: /Welcome back/ }),
        ),
      );
    }
    expect(percentile(times, 95), `p95 ${seconds(percentile(times, 95))}`).toBeLessThanOrEqual(ms(2_500));
  });
});

test.describe("first load of the whole app, cold", () => {
  test("@perf a brand-new browser context reaches the dashboard, signed in, within the cold budget", async ({
    browser,
    baseURL,
  }, testInfo) => {
    const context = await browser.newContext({ baseURL, storageState: testInfo.project.use.storageState });
    const page = await context.newPage();
    try {
      await observePerformance(page);
      const started = performance.now();
      await page.goto("/dashboard");
      await page.getByRole("heading", { name: /Welcome back/ }).waitFor();
      const took = performance.now() - started;
      testInfo.annotations.push({ type: "cold", description: `dashboard cold ${seconds(took)}` });
      expect(took).toBeLessThanOrEqual(ms(6_000));
    } finally {
      await context.close();
    }
  });
});
