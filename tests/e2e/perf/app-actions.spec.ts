import type { Locator, Page } from "@playwright/test";

import { createProject, deleteProject, uniqueTitle } from "../support/app";
import { PERF_RUNS, ms } from "../support/env";
import { expect, test } from "../support/fixtures";
import { percentile, seconds } from "../support/stats";

// The round trip of every button that writes: from the click to the words that say it worked. Each is a Server
// Function that authenticates, validates, writes in one transaction, and re-renders the page (project-dashboard.md,
// "Server Function pattern"), so this is the database's latency plus the app's. Tagged @perf; budgets are for
// production (E2E_PERF_SCALE). Every project made here is deleted by the planner's own Delete, which is itself timed.

const P50 = 900;
const P95 = 2_000;

/** Click, then wait for the confirming element; returns milliseconds as the browser clock sees them. */
async function timed(page: Page, click: () => Promise<void>, done: Locator): Promise<number> {
  const started = await page.evaluate(() => performance.now());
  await click();
  await done.first().waitFor({ state: "visible" });
  return (await page.evaluate(() => performance.now())) - started;
}

function expectWithin(label: string, times: number[], p50: number, p95: number): void {
  expect(times.length, `${label}: no measurements`).toBeGreaterThan(0);
  test.info().annotations.push({
    type: "action",
    description: `${label}: p50 ${seconds(percentile(times, 50))}, p95 ${seconds(percentile(times, 95))}, n=${times.length}`,
  });
  expect(percentile(times, 50), `${label} p50`).toBeLessThanOrEqual(ms(p50));
  expect(percentile(times, 95), `${label} p95`).toBeLessThanOrEqual(ms(p95));
}

test.describe("writes on a project", () => {
  // Each repetition loads the page afresh: a confirmation from the previous press is still on screen until the next
  // result replaces it, and timing against it would measure nothing.
  test("@perf saving the project's details", async ({ page, blankProject }) => {
    const times: number[] = [];
    for (let i = 0; i < PERF_RUNS + 1; i += 1) {
      await page.goto(`/projects/${blankProject.id}/overview`);
      await page.getByRole("heading", { name: "Project details" }).click();
      await page.getByLabel("Applicant").fill(`Perf Applicant ${i}`);
      const took = await timed(
        page,
        () => page.getByRole("button", { name: "Save details" }).click(),
        page.getByRole("status").filter({ hasText: "Project details saved." }),
      );
      if (i > 0) times.push(took); // the first press warms the action
    }
    expectWithin("save details", times, P50, P95);
  });

  test("@perf sending feedback on a section", async ({ page, blankProject }) => {
    const times: number[] = [];
    for (let i = 0; i < PERF_RUNS + 1; i += 1) {
      await page.goto(`/projects/${blankProject.id}/evidence`);
      await page.getByLabel("Feedback on this section").fill(`Perf feedback ${i}`);
      const took = await timed(
        page,
        () => page.getByRole("button", { name: "Send feedback" }).click(),
        page.getByRole("status").filter({ hasText: "Feedback recorded." }),
      );
      if (i > 0) times.push(took);
    }
    expectWithin("send feedback", times, P50, P95);
  });

  test("@perf a refused upload (the error path) is as fast as a successful write", async ({
    page,
    blankProject,
  }) => {
    const times: number[] = [];
    for (let i = 0; i < PERF_RUNS; i += 1) {
      await page.goto(`/projects/${blankProject.id}/site`);
      await page.getByLabel("Upload a boundary (.geojson, up to 2 MB)").setInputFiles({
        name: "point.geojson",
        mimeType: "application/geo+json",
        buffer: Buffer.from('{"type":"Point","coordinates":[-122.0,47.6]}'),
      });
      times.push(
        await timed(
          page,
          () => page.getByRole("button", { name: "Upload boundary" }).click(),
          page.getByRole("alert").filter({ hasText: "The file holds a Point." }),
        ),
      );
    }
    expectWithin("refused upload", times, P50, P95);
  });
  test("@perf loading the sample study area: the write and the queueing of the analysis happen in one transaction", async ({
    page,
    blankProject,
  }) => {
    await page.goto(`/projects/${blankProject.id}/site`);
    const took = await timed(
      page,
      () => page.getByRole("button", { name: "Load sample study area" }).click(),
      page.getByRole("status").filter({ hasText: "Sample study area loaded." }),
    );
    test.info().annotations.push({ type: "action", description: `load sample study area: ${seconds(took)}` });
    expect(took).toBeLessThanOrEqual(ms(3_000));
  });

  test("@perf loading sample details", async ({ page, blankProject }) => {
    await page.goto(`/projects/${blankProject.id}/overview`);
    await page.getByRole("heading", { name: "Project details" }).click();
    const took = await timed(
      page,
      () => page.getByRole("button", { name: "Load sample details" }).click(),
      page.getByRole("status").filter({ hasText: "Sample details loaded." }),
    );
    expect(took).toBeLessThanOrEqual(ms(P95));
  });
});

test.describe("creating and deleting research", () => {
  test("@perf creating a project: from the button to the new project's Overview", async ({ page }) => {
    const created: string[] = [];
    const times: number[] = [];
    try {
      for (let i = 0; i < PERF_RUNS + 1; i += 1) {
        const title = uniqueTitle("perf-create");
        await page.goto("/projects/new");
        await page.getByLabel("Title").fill(title);
        const started = await page.evaluate(() => performance.now());
        await page.getByRole("button", { name: "Create project" }).click();
        await page.waitForURL(/\/projects\/[0-9a-f-]{36}\/overview$/);
        await page.getByRole("heading", { level: 1, name: title }).waitFor();
        // A soft navigation keeps the same document, so the clock continues; a hard one restarts it, and the figure is then that load alone.
        const took = (await page.evaluate(() => performance.now())) - started;
        created.push(title);
        if (i > 0) times.push(Math.max(0, took));
      }
      expectWithin("create project", times, 1_500, 3_000);
    } finally {
      for (const title of created) await deleteProject(page, title);
    }
  });

  test("@perf deleting a project: from the confirm button to the row gone", async ({ page }) => {
    const times: number[] = [];
    for (let i = 0; i < PERF_RUNS; i += 1) {
      const title = uniqueTitle("perf-delete");
      await createProject(page, { title });
      await page.goto("/dashboard");
      const trigger = page.getByRole("button", { name: `Delete research: ${title}` });
      await trigger.click();
      const confirm = page.getByRole("dialog").getByRole("button", { name: "Delete research" });
      const started = await page.evaluate(() => performance.now());
      await confirm.click();
      await expect(trigger).toHaveCount(0);
      times.push((await page.evaluate(() => performance.now())) - started);
    }
    expectWithin("delete project", times, 1_200, 2_500);
  });
});

test.describe("reads that are really writes", () => {
  test("@perf the stage rail and the dashboard re-read after a write within the same budget as a fresh load", async ({
    page,
    blankProject,
  }) => {
    await page.goto(`/projects/${blankProject.id}/evidence`);
    const before = await page.evaluate(() => performance.now());
    await page.getByLabel("Feedback on this section").fill("Perf: re-render after write");
    await page.getByRole("button", { name: "Send feedback" }).click();
    await page.getByText(/Earlier feedback \(\d+\)/).waitFor();
    const took = (await page.evaluate(() => performance.now())) - before;
    expect(took).toBeLessThanOrEqual(ms(2_500));
  });
});
