import { expect, test, type Page } from "@playwright/test";

import {
  createProject,
  createSampleProject,
  deleteProject,
  goToStep,
  stageLink,
  uniqueTitle,
  waitForAnalysisToSettle,
} from "../support/app";
import { ANALYSIS_TIMEOUT_MS, DOCUMENT_TIMEOUT_MS, ms } from "../support/env";
import { downloadDocument, finishAndWait, reviewPhase, shownSha256 } from "../support/journey";
import { seconds } from "../support/stats";

// The work that happens after a click, in the background worker: the analysis that follows a saved boundary, and the
// final document that follows "Finish research". A planner watches a banner for these, so how long they take is a
// feature (TechDesign/system-architecture.md: work longer than one function invocation runs in the worker). Needs
// the worker (npm run worker:dev). Tagged @perf; budgets are for production (E2E_PERF_SCALE).
//
// One project goes through the whole pipeline in order, so the steps depend on each other and stop at the first
// failure (serial mode). Each timing is an annotation and an attached JSON file.

test.describe.configure({ mode: "serial" });

const title = uniqueTitle("perf-pipeline");
let page: Page;
let projectId = "";
const timings: Record<string, number> = {};

async function timeUntil(name: string, work: () => Promise<void>): Promise<number> {
  const started = performance.now();
  await work();
  const took = performance.now() - started;
  timings[name] = took;
  test.info().annotations.push({ type: "pipeline", description: `${name}: ${seconds(took)}` });
  return took;
}

test.beforeAll(async ({ browser, baseURL }, testInfo) => {
  page = await (
    await browser.newContext({ baseURL, storageState: testInfo.project.use.storageState })
  ).newPage();
});

test.afterAll(async () => {
  if (projectId !== "") await deleteProject(page, title);
  await page.context().close();
});

test("@perf 1. analysis after the study area: from the click to 'analysis is current'", async () => {
  projectId = await createProject(page, {
    title,
    applicationType: "Short subdivision",
    applicationFiledOn: "2026-03-02",
  });
  await goToStep(page, "site");
  const took = await timeUntil("study area to analysis", async () => {
    await page.getByRole("button", { name: "Load sample study area" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Sample study area loaded." })).toBeVisible();
    await waitForAnalysisToSettle(page);
  });
  expect(took, `the first analysis took ${seconds(took)}`).toBeLessThanOrEqual(ms(60_000));
  expect(took).toBeLessThanOrEqual(ANALYSIS_TIMEOUT_MS);
});

test("@perf 2. analysis after the footprint adds the impact measure", async () => {
  await goToStep(page, "footprint");
  const took = await timeUntil("footprint to analysis", async () => {
    await page.getByRole("button", { name: "Load sample footprint" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Sample footprint loaded." })).toBeVisible();
    await waitForAnalysisToSettle(page);
  });
  expect(took, `the footprint analysis took ${seconds(took)}`).toBeLessThanOrEqual(ms(60_000));
});

test("@perf 3. an input that changes nothing re-runs just as fast, or faster, than the first analysis", async () => {
  await goToStep(page, "site");
  const took = await timeUntil("repeat study area to analysis", async () => {
    await page.getByRole("button", { name: "Load sample study area" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Sample study area loaded." })).toBeVisible();
    await waitForAnalysisToSettle(page);
  });
  expect(took).toBeLessThanOrEqual(Math.max(timings["study area to analysis"] ?? 0, ms(15_000)) * 1.5);
});

test("@perf 4. the banner tells the truth while it waits: it appears, then it goes, and never shows 'failed'", async () => {
  await goToStep(page, "site");
  await page.getByRole("button", { name: "Load sample study area" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Sample study area loaded." })).toBeVisible();
  // Within a few seconds the frame names the state: waiting for the worker, or running.
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: /Analysis is (running|out of date)/ })
      .first(),
  ).toBeVisible({ timeout: ms(10_000) });
  await waitForAnalysisToSettle(page);
  await expect(page.getByRole("alert").filter({ hasText: "Analysis failed" })).toHaveCount(0);
});

test("@perf 5. six reviews, each a write under the review's own transaction", async () => {
  const times: number[] = [];
  for (const phase of ["site", "evidence", "screening", "studies", "footprint", "impact"] as const) {
    const took = await timeUntil(`review ${phase}`, () => reviewPhase(page, phase));
    times.push(took);
  }
  expect(Math.max(...times), `slowest review ${seconds(Math.max(...times))}`).toBeLessThanOrEqual(ms(4_000));
});

test("@perf 6. finishing: from the click to a published, hashed document", async () => {
  await goToStep(page, "report");
  await expect(stageLink(page, "Report")).toContainText("Ready to finish");
  const took = await timeUntil("finish to published", () => finishAndWait(page, 1));
  expect(took, `the document took ${seconds(took)} to publish`).toBeLessThanOrEqual(ms(90_000));
  expect(took).toBeLessThanOrEqual(DOCUMENT_TIMEOUT_MS);
});

test("@perf 7. the document downloads quickly, is a reasonable size, and its hash matches", async () => {
  await goToStep(page, "report");
  const shown = await shownSha256(page, 1);
  const times: number[] = [];
  let last = await downloadDocument(page, projectId, 1);
  for (let i = 0; i < 5; i += 1) {
    const started = performance.now();
    last = await downloadDocument(page, projectId, 1);
    times.push(performance.now() - started);
  }
  test.info().annotations.push({
    type: "document",
    description: `${(last.bytes.length / 1024).toFixed(0)} KB; download p50 ${seconds(times.sort((a, b) => a - b)[2] ?? 0)}`,
  });

  expect(last.status).toBe(200);
  expect(last.computedSha256).toBe(shown);
  expect(last.bytes.length / 1024 / 1024, "document size in MB").toBeLessThanOrEqual(8);
  expect(Math.max(...times), `slowest download ${seconds(Math.max(...times))}`).toBeLessThanOrEqual(
    ms(3_000),
  );
});

test("@perf 8. starting a research change on finished work", async () => {
  await page.goto("/dashboard");
  const row = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: `Delete research: ${title}` }) });
  await row.getByRole("button", { name: `Re-research: ${title}` }).click();
  const confirm = page.getByRole("dialog").getByRole("button", { name: "Start research change" });
  const took = await timeUntil("start research change", async () => {
    await confirm.click();
    await page.waitForURL(new RegExp(`/projects/${projectId}/overview$`));
    await page.getByRole("heading", { name: /Research change from version 1/ }).waitFor();
  });
  expect(took).toBeLessThanOrEqual(ms(3_000));
});

test("@perf 9. a whole sample project, from the first click to an analysed Overview", async () => {
  const started = performance.now();
  const created = await createSampleProject(page);
  await waitForAnalysisToSettle(page);
  const took = performance.now() - started;
  test
    .info()
    .annotations.push({ type: "pipeline", description: `sample project to analysed: ${seconds(took)}` });
  try {
    expect(created.title.length).toBeGreaterThan(0);
    expect(took, `a sample project took ${seconds(took)} to be ready`).toBeLessThanOrEqual(ms(75_000));
  } finally {
    await deleteProject(page, created.title);
  }
});

test("@perf 10. the pipeline's timings, for the record", async () => {
  await test
    .info()
    .attach("pipeline.json", { body: JSON.stringify(timings, null, 2), contentType: "application/json" });
  expect(Object.keys(timings).length).toBeGreaterThanOrEqual(8);
});
